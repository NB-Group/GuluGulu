<script setup lang="ts">
import { fetchLentilleContext, friendlyError, needLogin } from '~/utils/luogu-api'

const props = defineProps<{
  query?: string
}>()

interface SearchResultItem {
  type: 'problem' | 'contest' | 'blog' | 'user'
  title: string
  subtitle: string
  id: string
  tags?: string[]
  extra?: string
}

const searchQuery = ref(props.query || '')
const loading = ref(false)
const hasSearched = ref(false)
const errorMsg = ref('')
const needLoginFlag = ref(false)
const results = ref<SearchResultItem[]>([])
const totalCount = ref(0)

// Difficulty labels mirror ProblemList.vue (Luogu's numeric difficulty scale)
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

const typeConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  problem: { label: '题目', color: '#1890ff', bg: '#1890ff20', icon: 'i-mingcute:code-line' },
  contest: { label: '比赛', color: '#52c41a', bg: '#52c41a20', icon: 'i-mingcute:trophy-line' },
  blog: { label: '讨论', color: '#722ed1', bg: '#722ed120', icon: 'i-mingcute:comment-line' },
  user: { label: '用户', color: '#faad14', bg: '#faad1420', icon: 'i-mingcute:user-4-line' },
}

function difficultyLabel(d: number) {
  return difficultyMap[d]?.label || '未知'
}

async function handleSearch(keyword: string) {
  const kw = keyword.trim()
  if (!kw)
    return
  searchQuery.value = kw
  hasSearched.value = true
  loading.value = true
  errorMsg.value = ''
  needLoginFlag.value = false
  results.value = []
  totalCount.value = 0

  try {
    // Real Luogu problem search — same endpoint as ProblemList.vue / PROBLEM.getList
    const url = `https://www.luogu.com.cn/problem/list?keyword=${encodeURIComponent(kw)}`
    const ctx = await fetchLentilleContext(url)

    if (!ctx) {
      errorMsg.value = friendlyError(new Error('Failed to fetch'))
    }
    else if (needLogin(ctx)) {
      needLoginFlag.value = true
    }
    else {
      // Lentille-context path: data.problems.result[] — confirmed via ProblemList.vue
      const problemSet = ctx?.data?.problems
      const list = problemSet?.result || []
      totalCount.value = problemSet?.count || list.length
      results.value = list.map((p: any) => {
        const submit = p.totalSubmit || 0
        const accepted = p.totalAccepted || 0
        const rate = submit > 0 ? Math.round((accepted / submit) * 100) : 0
        return {
          type: 'problem',
          title: `${p.pid} ${p.name || p.title || ''}`,
          subtitle: `${difficultyLabel(p.difficulty || 0)} | 通过率 ${rate}%`,
          id: p.pid,
          extra: `${submit.toLocaleString()} 次提交`,
        } as SearchResultItem
      })
    }
  }
  catch (e: any) {
    errorMsg.value = friendlyError(e)
  }
  finally {
    loading.value = false
  }
}

function openResult(item: SearchResultItem) {
  const urls: Record<string, string> = {
    problem: `https://www.luogu.com.cn/problem/${item.id}`,
    contest: `https://www.luogu.com.cn/contest/${item.id}`,
    blog: `https://www.luogu.com.cn/discuss/${item.id}`,
    user: `https://www.luogu.com.cn/user/${item.id}`,
  }
  window.open(urls[item.type] || 'https://www.luogu.com.cn/', '_blank')
}

function openLuoguSearch() {
  window.open(`https://www.luogu.com.cn/problem/list?keyword=${encodeURIComponent(searchQuery.value)}`, '_blank')
}

function openLogin() {
  window.open('https://www.luogu.com.cn/auth/login', '_blank')
}
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <!-- Search Header -->
    <div
      bg="$bew-content" rounded="$bew-radius" p-6 mb-6
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 $bew-border-color"
      style="backdrop-filter: var(--bew-filter-glass-1)"
    >
      <h1 text="2xl $bew-text-1" fw-bold mb-4>
        搜索
      </h1>
      <div max-w="550px">
        <SearchBar @search="handleSearch" />
      </div>
    </div>

    <!-- Search query indicator -->
    <div
      v-if="hasSearched && searchQuery && !loading && !errorMsg && !needLoginFlag"
      text="sm $bew-text-2" mb-4
      flex="~ items-center gap-2"
    >
      <span>搜索: </span>
      <span fw-bold text="$bew-theme-color">"{{ searchQuery }}"</span>
      <span>找到 {{ totalCount }} 个结果</span>
    </div>

    <!-- Loading -->
    <Loading v-if="loading" />

    <!-- Results List -->
    <Transition name="content-reveal">
      <div
        v-if="!loading && hasSearched && results.length > 0"
        bg="$bew-content" rounded="$bew-radius"
        shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
        border="1 $bew-border-color"
        style="backdrop-filter: var(--bew-filter-glass-1)"
        overflow="hidden"
      >
        <div
          v-for="(item, index) in results"
          :key="`${item.type}-${item.id}`"
          class="stagger-row hover:bg-$bew-fill-2"
          :style="{ '--row-index': index }"
          flex="~ items-center gap-3" p="x-6 y-3.5"
          cursor="pointer"
          duration-200
          border="b-1 $bew-border-color"
          :class="index === results.length - 1 ? 'border-b-0' : ''"
          @click="openResult(item)"
        >
        <!-- Type icon -->
        <div
          w="36px" h="36px" rounded-full shrink-0
          flex="~" items="center" justify="center"
          :style="{ backgroundColor: typeConfig[item.type].bg }"
        >
          <div :class="typeConfig[item.type].icon" :style="{ color: typeConfig[item.type].color }" />
        </div>

        <!-- Content -->
        <div flex="~ col 1" gap-0.5 min-w-0>
          <div flex="~ items-center gap-2">
            <span
              text="xs" p="x-1.5 y-0.5" rounded="$bew-radius-half"
              :style="{
                backgroundColor: typeConfig[item.type].bg,
                color: typeConfig[item.type].color,
              }"
              shrink-0
            >{{ typeConfig[item.type].label }}</span>
            <span text="sm $bew-text-1" fw-bold overflow-hidden text-ellipsis whitespace-nowrap>
              {{ item.title }}
            </span>
          </div>
          <span text="xs $bew-text-3" overflow-hidden text-ellipsis whitespace-nowrap>
            {{ item.subtitle }}
          </span>
        </div>

        <!-- Tags -->
        <div flex="~ gap-1" class="hidden md:flex" shrink-0>
          <span
            v-for="tag in (item.tags || []).slice(0, 2)"
            :key="tag"
            text="xs $bew-text-3"
            p="x-1.5 y-0.5"
            rounded="$bew-radius-half"
            bg="$bew-fill-1"
          >{{ tag }}</span>
        </div>

        <!-- Extra info -->
        <span text="xs $bew-text-2" shrink-0 class="hidden sm:block">
          {{ item.extra }}
        </span>

        <div i-mingcute:right-line text="sm $bew-text-3" shrink-0 />
      </div>
    </div>
    </Transition>

    <!-- Need Login State -->
    <div
      v-if="!loading && needLoginFlag"
      bg="$bew-content" rounded="$bew-radius" p-8
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 $bew-border-color"
      style="backdrop-filter: var(--bew-filter-glass-1)"
      flex="~ col" items="center" text="center $bew-text-2"
    >
      <div i-mingcute:lock-line text="3xl $bew-text-3" mb-3 />
      <p mb-1>
        请先登录洛谷后再使用搜索
      </p>
      <Button type="primary" mt-4 @click="openLogin">
        前往登录
      </Button>
    </div>

    <!-- Error State -->
    <div
      v-if="!loading && errorMsg"
      bg="$bew-content" rounded="$bew-radius" p-8
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 $bew-border-color"
      style="backdrop-filter: var(--bew-filter-glass-1)"
      flex="~ col" items="center" text="center $bew-text-2"
    >
      <div i-mingcute:warning-line text="3xl $bew-text-3" mb-3 />
      <p>{{ errorMsg }}</p>
      <Button type="primary" mt-4 @click="handleSearch(searchQuery)">
        重试
      </Button>
    </div>

    <!-- Empty State -->
    <Empty v-if="!loading && hasSearched && !errorMsg && !needLoginFlag && results.length === 0" description="未找到相关结果">
      <Button type="primary" mt-4 @click="openLuoguSearch">
        前往洛谷搜索
      </Button>
    </Empty>

    <!-- Initial state (no search yet) -->
    <div
      v-if="!hasSearched"
      flex="~ col" items="center" justify="center" py-16
    >
      <div i-mingcute:search-line text="6xl $bew-text-3" mb-4 />
      <p text="lg $bew-text-2">输入关键词搜索题目</p>
    </div>
  </div>
</template>
