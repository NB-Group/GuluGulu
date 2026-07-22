<script setup lang="ts">
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { renderIcon } from '~/utils/icons'
import { searchKeyword } from '~/utils/luogu-api'

defineProps<{
  gridLayout?: GridLayoutType
}>()

interface ProblemItem {
  pid: string
  title: string
  difficulty: number
  tags: number[]
  totalSubmit: number
  totalAccepted: number
}

const { navigateTo } = useGuluApp()
const localGridLayout = ref<GridLayoutType>('adaptive')
const currentPage = ref(1)
const pageSize = 50
const loading = ref(true)
const loadingMore = ref(false)
const problems = shallowRef<ProblemItem[]>([])
const totalCount = ref(0)
const errorMsg = ref('')
const selectedDifficulty = ref<number | null>(null)
const selectedType = ref('')
const sentinelRef = ref<HTMLDivElement>()

const difficultyMap: Record<number, { label: string, color: string }> = {
  0: { label: '暂无评定', color: '#909399' },
  1: { label: '入门', color: '#FE4D61' },
  2: { label: '普及−', color: '#F39B18' },
  3: { label: '普及', color: '#FFBF1C' },
  4: { label: '普及+/提高-', color: '#54C320' },
  5: { label: '提高', color: '#1AC1C1' },
  6: { label: '提高+/省选−', color: '#3797DA' },
  7: { label: '省选/NOI−', color: '#9A3FCE' },
  8: { label: 'NOI/NOI+/CTS', color: '#162369' },
}

const typeOptions = [
  { label: '全部题库', value: '' },
  { label: '洛谷', value: 'P' },
  { label: 'Codeforces', value: 'CF' },
  { label: 'SPOJ', value: 'SP' },
  { label: 'UVA', value: 'UVA' },
  { label: 'AtCoder', value: 'AT' },
]
const difficultyOptions = [
  { label: '全部难度', value: null },
  { label: '入门', value: 1 },
  { label: '普及−', value: 2 },
  { label: '普及/提高−', value: 3 },
  { label: '普及+/提高-', value: 4 },
  { label: '提高', value: 5 },
  { label: '提高+/省选−', value: 6 },
  { label: '省选/NOI−', value: 7 },
  { label: 'NOI/NOI+/CTS', value: 8 },
]

const gridClass = computed(() => {
  if (localGridLayout.value === 'adaptive')
    return 'grid-adaptive'
  if (localGridLayout.value === 'twoColumns')
    return 'grid-two-columns'
  return 'grid-single-column'
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(totalCount.value / pageSize)),
)

async function fetchProblems(append = false) {
  if (append)
    loadingMore.value = true
  else loading.value = true
  errorMsg.value = ''

  try {
    const data: any = await browser.runtime.sendMessage({
      contentScriptQuery: 'PROBLEM.getList',
      page: currentPage.value,
      difficulty: selectedDifficulty.value || '',
      keyword: searchKeyword.value,
      type: selectedType.value,
    })

    if (data?.error) {
      errorMsg.value = data.error
    }
    else if (data?.__needLogin) {
      errorMsg.value = '需要登录洛谷才能查看'
    }
    else if (data?.data?.problems) {
      const result = data.data.problems
      const items = (result.result || []).map((p: any) => ({
        pid: p.pid,
        title: p.name || p.title || '',
        difficulty: p.difficulty || 0,
        tags: p.tags || [],
        totalSubmit: p.totalSubmit || 0,
        totalAccepted: p.totalAccepted || 0,
      }))
      problems.value = append ? [...problems.value, ...items] : items
      totalCount.value = result.count || 0
    }
    else {
      errorMsg.value = '数据格式不匹配'
    }
  }
  catch (e: any) {
    errorMsg.value = e.message || '获取失败'
  }
  finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadMore() {
  if (loadingMore.value || currentPage.value >= totalPages.value)
    return
  currentPage.value++
  fetchProblems(true)
}

function resetAndFetch() {
  currentPage.value = 1
  problems.value = []
  fetchProblems()
}

// Mount: check window bridge from TopBar search
onMounted(() => {
  const pending = (window as any).__gulu_search_pending
  if (pending) {
    searchKeyword.value = pending
    delete (window as any).__gulu_search_pending
  }
  fetchProblems()
})

// Auto-load sentinel observer
let observer: IntersectionObserver | null = null
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && !loading.value && !loadingMore.value) {
        loadMore()
      }
    },
    { rootMargin: '1200px' },
  )

  // Observe the sentinel after next render tick
  nextTick(() => {
    if (observer && sentinelRef.value) {
      observer.observe(sentinelRef.value)
    }
  })
})

// Re-observe when sentinel appears/disappears
watch(sentinelRef, (el) => {
  if (observer) {
    observer.disconnect()
    if (el)
      observer.observe(el as Element)
  }
})

onUnmounted(() => observer?.disconnect())

// Watchers — refetch when keyword, type, or difficulty changes (not page)
watch(
  () => searchKeyword.value,
  () => resetAndFetch(),
)
watch(selectedType, () => resetAndFetch())
watch(selectedDifficulty, () => resetAndFetch())

function handleSearch(keyword: string) {
  searchKeyword.value = keyword
}
function openProblem(pid: string) {
  navigateTo(AppPage.ProblemDetail, `https://www.luogu.com.cn/problem/${pid}`)
}
// /problem/random 302 跳到一道随机题,fetch 跟随重定向后取最终 URL
async function randomProblem() {
  try {
    const r = await fetch('https://www.luogu.com.cn/problem/random', { credentials: 'same-origin' })
    if (r.url && /\/problem\/[A-Za-z0-9_]+/.test(r.url))
      navigateTo(AppPage.ProblemDetail, r.url)
  }
  catch (e) { console.warn('[GuluGulu] random problem failed', e) }
}
function difficultyLabel(d: number) {
  return difficultyMap[d]?.label || '未知'
}
function difficultyColor(d: number) {
  return difficultyMap[d]?.color || '#909399'
}
</script>

<template>
  <div
    class="page-container"
    w-full
    h-full
    p="x-4 md:x-8 lg:x-16"
    pos="relative"
  >
    <div
      bg="$bew-content"
      rounded="$bew-radius"
      p-6
      mb-6
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 $bew-border-color"
      style="
        backdrop-filter: var(--bew-filter-glass-1);
        z-index: 9;
        position: sticky;
        top: calc(var(--bew-top-bar-height) + 10px);
      "
    >
      <h1
        style="font-size: 1.5rem; color: var(--bew-text-1); font-weight: 700"
        mb-4
        flex="~ items-center gap-2"
      >
        <span
          style="display: contents; color: var(--bew-theme-color)"
          v-html="renderIcon('mingcute:code-line', 24)"
        />
        题库
        <button
          class="btn-press"
          style="font-size:.8rem;font-weight:500;padding:4px 12px;border-radius:999px;border:1px solid var(--bew-border-color);background:var(--bew-fill-1);color:var(--bew-text-2);cursor:pointer"
          flex="~ items-center gap-1"
          title="随机来一题"
          @click="randomProblem"
        >
          <span v-html="renderIcon('mingcute:sparkles-2-line', 16)" /><span>随机</span>
        </button>
      </h1>
      <div mb-4>
        <SearchBar @search="handleSearch" />
      </div>
      <div flex="~ col md:row gap-3" items="center" justify="between">
        <div flex="~ gap-2 wrap">
          <Select
            v-model="selectedType"
            :options="typeOptions"
            placeholder="题目来源"
          />
          <Select
            v-model="selectedDifficulty"
            :options="difficultyOptions"
            placeholder="题目难度"
          />
        </div>
        <div
          flex="~ gap-1"
          items="center"
          bg="$bew-fill-1"
          rounded="$bew-radius-half"
          p-1
        >
          <button
            v-for="m in [
              { k: 'adaptive', i: 'layout-6-line' },
              { k: 'twoColumns', i: 'layout-5-line' },
              { k: 'singleColumn', i: 'layout-line' },
            ]"
            :key="m.k"
            p="x-2 y-1"
            rounded="$bew-radius-half"
            border="none"
            cursor="pointer"
            :style="{
              background:
                localGridLayout === m.k ? 'var(--bew-theme-color)' : '',
              color: localGridLayout === m.k ? 'white' : 'var(--bew-text-2)',
            }"
            @click="localGridLayout = m.k as any"
          >
            <span
              style="display: contents"
              v-html="renderIcon(`mingcute:${m.i}`, 16)"
            />
          </button>
        </div>
      </div>
    </div>

    <div
      flex="~ items-center"
      justify="between"
      mb-4
      style="font-size: var(--bew-base-font-size); color: var(--bew-text-2)"
    >
      <span v-if="searchKeyword">搜索 "{{ searchKeyword }}" — {{ totalCount }} 题</span>
      <span v-else>共 {{ totalCount }} 题</span>
    </div>

    <Loading v-if="loading" />

    <div
      v-if="!loading && errorMsg"
      bg="$bew-content"
      rounded="$bew-radius"
      p-8
      border="1 $bew-border-color"
      text="center $bew-text-2"
    >
      <span
        style="display: contents"
        v-html="renderIcon('mingcute:warning-line', 32)"
      />
      <p mt-2>
        {{ errorMsg }}
      </p>
    </div>

    <Transition name="content-reveal">
      <TransitionGroup v-if="!loading && problems.length > 0" name="flip-list" tag="div" :class="gridClass" mb-6>
        <div
          v-for="(p, idx) in problems"
          :key="p.pid"
          class="stagger-card problem-card"
          :style="{
            '--card-index': idx,
            'backdropFilter': 'var(--bew-filter-glass-1)',
          }"
          bg="$bew-content"
          rounded="$bew-radius"
          p-4
          shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
          border="1 $bew-border-color"
          cursor="pointer"
          @click="openProblem(p.pid)"
        >
          <div flex="~ items-center justify-between" mb-2>
            <span
              style="
                font-size: var(--bew-base-font-size);
                color: var(--bew-text-3);
                font-family: monospace;
              "
            >{{ p.pid }}</span>
            <span
              text="xs"
              fw-bold
              p="x-2 y-0.5"
              rounded="$bew-radius-half"
              :style="{
                backgroundColor: `${difficultyColor(p.difficulty)}20`,
                color: difficultyColor(p.difficulty),
              }"
            >{{ difficultyLabel(p.difficulty) }}</span>
          </div>
          <h3
            style="
              font-size: var(--bew-base-font-size);
              color: var(--bew-text-1);
              font-weight: 600;
            "
            mb-3
          >
            {{ p.title }}
          </h3>
          <div flex="~ items-center gap-1" text="xs $bew-text-3">
            <span
              style="display: contents"
              v-html="renderIcon('mingcute:chart-bar-line', 14)"
            />
            <span>{{ p.totalSubmit.toLocaleString() }} 提交 /
              {{ p.totalAccepted.toLocaleString() }} 通过</span>
          </div>
        </div>
      </TransitionGroup>
    </Transition>

    <!-- Sentinel for infinite scroll -->
    <div
      v-if="!loading && problems.length > 0 && currentPage < totalPages"
      ref="sentinelRef"
      style="
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
      "
    >
      <Loading v-if="loadingMore" />
      <span v-else text="sm $bew-text-3">向下滚动加载更多...</span>
    </div>
    <div
      v-if="!loading && problems.length > 0 && currentPage >= totalPages"
      text="sm $bew-text-3"
      text-center
      pb-8
    >
      已加载全部 {{ totalCount }} 道题目
    </div>

    <div
      v-if="!loading && !errorMsg && problems.length === 0"
      bg="$bew-content"
      rounded="$bew-radius"
      p-8
      border="1 $bew-border-color"
      text="center $bew-text-2"
    >
      <span
        style="display: contents"
        v-html="renderIcon('mingcute:search-line', 32)"
      />
      <p mt-2>
        没有找到符合条件的题目
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.difficulty-select {
  appearance: none;
  background-color: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius-half);
  padding: 6px 28px 6px 12px;
  font-size: var(--bew-base-font-size);
  color: var(--bew-text-1);
  outline: none;
  cursor: pointer;
  backdrop-filter: var(--bew-filter-glass-1);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
.grid-adaptive {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.grid-two-columns {
  display: grid;
  /* auto-fit + minmax 让两列布局在窄屏自动塌成单列,避免每列被挤到 200px 以下 */
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
.grid-single-column {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
.problem-card {
  transition:
    box-shadow var(--bew-dur-fast),
    transform var(--bew-dur-fast);
}
.problem-card:hover {
  box-shadow: var(--bew-shadow-2) !important;
  transform: translateY(-2px);
}
</style>
