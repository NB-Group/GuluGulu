<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'
import { friendlyError, fetchLentilleContext } from '~/utils/luogu-api'
import { parseMarkdownContent } from '~/utils/markdown'
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'

const { currentUrl, navigateTo } = useGulyApp()

interface Solution {
  lid: string; title: string; time: number
  author: { uid: number; name: string; avatar: string; color: string; badge: string | null }
  content: string; upvote: number; replyCount: number
  verified: boolean; status: number
}

const solutions = ref<Solution[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const errorMsg = ref('')
const problemTitle = ref('')
const solPage = ref(1)
const solTotal = ref(0)

const expandedLid = ref<string | null>(null)

const pid = computed(() => {
  const m = currentUrl.value.match(/\/problem\/solution\/([A-Z]?\d+)/i)
  return m?.[1] || null
})

// ============================================================
// Fetch solution list
// ============================================================
async function fetchSolutions(page = 1) {
  if (!pid.value) { errorMsg.value = '无效的题目ID'; loading.value = false; return }
  if (page === 1) loading.value = true; else loadingMore.value = true
  errorMsg.value = ''

  try {
    const url = page > 1
      ? `https://www.luogu.com.cn/problem/solution/${pid.value}?page=${page}`
      : `https://www.luogu.com.cn/problem/solution/${pid.value}`
    const ctx = await fetchLentilleContext(url)
    if (!ctx || ctx.__needLogin) {
      errorMsg.value = '请先登录洛谷后查看题解'
      loading.value = false; return
    }

    const cd = ctx?.data || ctx?.currentData || {}
    problemTitle.value = cd.problem?.title || cd.problem?.name || pid.value
    solTotal.value = cd.solutions?.count || 0

    const raw = cd.solutions?.result || cd.solutions || []
    const items = raw.map((s: any) => ({
      lid: s.lid || '',
      title: s.title || '',
      time: s.time || 0,
      author: s.author || {},
      content: s.content || '',
      upvote: s.upvote || 0,
      replyCount: s.replyCount || 0,
      verified: s.status === 2 || s.promoteStatus === 2 || false,
      status: s.status || 0,
    }))
    solutions.value = page === 1 ? items : [...solutions.value, ...items]
    solPage.value = page
  } catch (e: any) { errorMsg.value = friendlyError(e) }
  loading.value = false; loadingMore.value = false
}

function loadMoreSolutions() {
  if (loadingMore.value) return
  fetchSolutions(solPage.value + 1)
}

// ============================================================
// Navigation
// ============================================================
function toggleExpand(lid: string) {
  expandedLid.value = expandedLid.value === lid ? null : lid
}
function openProblem() {
  navigateTo(AppPage.ProblemDetail, `https://www.luogu.com.cn/problem/${pid.value}`)
}
function openUser(uid: number) {
  window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank')
}

onMounted(fetchSolutions)
watch(pid, () => fetchSolutions())
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
      <button @click="openProblem" style="background:none;border:none;cursor:pointer;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)" mb-2>← 返回题目</button>
      <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:700" mb-2>题解</h1>
      <p v-if="problemTitle" text="$bew-text-2">{{ pid }} {{ problemTitle }}</p>
    </div>

    <Loading v-if="loading" />
    <div v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" style="text-align:center;color:var(--bew-text-2);backdrop-filter:var(--bew-filter-glass-1)">
      <span v-html="renderIcon('mingcute:warning-line', 32)" style="display:contents" /><p mt-2>{{ errorMsg }}</p>
    </div>

    <Transition name="content-reveal">
      <div v-if="!loading && solutions.length > 0" bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden">
        <div
          v-for="(s, idx) in solutions" :key="s.lid"
          :style="{ '--row-index': idx }"
          border="b-1 $bew-border-color"
        >
          <!-- Solution header row -->
          <div
            class="stagger-row hover:bg-$bew-fill-2"
            p="x-6 y-4" flex="~ items-center gap-4" cursor="pointer" duration-200
            @click="toggleExpand(s.lid)"
          >
            <div flex="~ items-center gap-2" shrink-0>
              <img :src="s.author?.avatar" style="width:28px;height:28px;border-radius:50%;object-fit:cover" @error="(e:any)=>{e.target.style.display='none'}" />
              <span :style="{color:s.author?.color?`var(--bew-${s.author.color})`:'var(--bew-text-1)',fontWeight:600,fontSize:'var(--bew-base-font-size)'}">{{ s.author?.name }}</span>
            </div>
            <div flex="1" min-w-0>
              <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ s.title }}</div>
            </div>
            <div flex="~ items-center gap-3" shrink-0 style="font-size:.85em;color:var(--bew-text-3)">
              <span v-if="s.verified" text="xs" px-2 py-0.5 rounded-full style="background:var(--bew-success-color-20);color:var(--bew-success-color);font-weight:600">认证</span>
              <span flex="~ items-center gap-1"><span v-html="renderIcon('mingcute:arrow-up-line', 14)" style="display:contents"/>{{ s.upvote }}</span>
              <span flex="~ items-center gap-1"><span v-html="renderIcon('mingcute:comment-line', 14)" style="display:contents"/>{{ s.replyCount }}</span>
              <span>{{ timeAgo(s.time) }}</span>
              <span v-html="renderIcon(expandedLid === s.lid ? 'mingcute:arrow-up-line' : 'mingcute:arrow-down-line', 16)" style="display:contents;color:var(--bew-text-3)" />
            </div>
          </div>

          <!-- Expanded content -->
          <Transition name="page-fade">
            <div v-if="expandedLid === s.lid" p="x-6 y-4" bg="$bew-fill-1">
              <div class="markdown-body" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);line-height:1.8" v-html="parseMarkdownContent(s.content || '*(无内容)*')" />
            </div>
          </Transition>
        </div>
      </div>
    </Transition>

    <Loading v-if="loadingMore" />
    <div v-if="!loading && solutions.length > 0 && solutions.length < solTotal" text="center" mt-4 mb-4>
      <button style="background:var(--bew-fill-2);color:var(--bew-text-2);border:1px solid var(--bew-border-color);border-radius:var(--bew-radius);padding:6px 24px;cursor:pointer;font-size:var(--bew-base-font-size)" @click="loadMoreSolutions">加载更多 ({{ solutions.length }}/{{ solTotal }})</button>
    </div>

    <div v-if="!loading && !errorMsg && solutions.length === 0" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" style="text-align:center;color:var(--bew-text-3);font-size:var(--bew-base-font-size);backdrop-filter:var(--bew-filter-glass-1)">
      <span v-html="renderIcon('mingcute:bulb-line', 48)" style="display:contents" /><p mt-2>暂无题解</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.markdown-body {
  :deep(h1) { font-size: 1.4em; font-weight: 700; margin: 1em 0 .5em; color: var(--bew-text-1); }
  :deep(h2) { font-size: 1.25em; font-weight: 700; margin: 1em 0 .5em; color: var(--bew-text-1); }
  :deep(h3) { font-size: 1.1em; font-weight: 600; margin: .8em 0 .4em; color: var(--bew-text-1); }
  :deep(p) { margin: .5em 0; }
  :deep(a) { color: var(--bew-theme-color); text-decoration: none; &:hover { text-decoration: underline; } }
  :deep(code) {
    font-family: 'Cascadia Code','Fira Code','JetBrains Mono',monospace;
    background: var(--bew-fill-2); padding: 2px 6px; border-radius: 4px; font-size: .9em;
  }
  :deep(pre) {
    background: var(--bew-fill-1); padding: 12px 16px; border-radius: var(--bew-radius); overflow-x: auto;
    code { background: none; padding: 0; }
  }
  :deep(blockquote) {
    border-left: 3px solid var(--bew-theme-color); padding: 4px 12px; margin: .5em 0;
    color: var(--bew-text-2); background: var(--bew-fill-1); border-radius: 0 var(--bew-radius) var(--bew-radius) 0;
  }
  :deep(ul), :deep(ol) { padding-left: 1.5em; margin: .5em 0; }
  :deep(li) { margin: .2em 0; }
  :deep(img) { max-width: 100%; border-radius: var(--bew-radius); }
  :deep(hr) { border: none; border-top: 1px solid var(--bew-border-color); margin: 1em 0; }
  :deep(table) { border-collapse: collapse; width: 100%; margin: .5em 0; }
  :deep(th), :deep(td) { border: 1px solid var(--bew-border-color); padding: 6px 12px; text-align: left; }
  :deep(th) { background: var(--bew-fill-1); font-weight: 600; }
  :deep(strong) { font-weight: 700; color: var(--bew-text-1); }
  :deep(del) { color: var(--bew-text-4); }
}
</style>
