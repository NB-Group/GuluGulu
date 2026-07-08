<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'
import { friendlyError, fetchLentilleContext } from '~/utils/luogu-api'
import { parseMarkdownContent } from '~/utils/markdown'
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'

const { currentUrl, navigateTo } = useGulyApp()

interface Solution {
  id: number; title: string; time: number; author: { uid: number; name: string; avatar: string; color: string; badge: string | null }
  content: string; upvoteCount: number; replyCount: number; verified: boolean; isOfficial: boolean
}

const solutions = ref<Solution[]>([])
const loading = ref(true)
const errorMsg = ref('')
const problemTitle = ref('')

// Detail view
const detail = ref<Solution | null>(null)
const detailLoading = ref(false)

const pid = computed(() => {
  const m = currentUrl.value.match(/\/problem\/solution\/([A-Z]?\d+)/i)
  return m?.[1] || null
})

const solutionId = computed(() => {
  const m = currentUrl.value.match(/\/problem\/solution\/[A-Z]?\d+#(\d+)/)
    || currentUrl.value.match(/\/problem\/solution\/[A-Z]?\d+\/(\d+)/)
  return m ? Number(m[1]) : null
})

// ============================================================
// Fetch solution list
// ============================================================
async function fetchSolutions() {
  if (!pid.value) { errorMsg.value = '无效的题目ID'; loading.value = false; return }
  loading.value = true; errorMsg.value = ''

  try {
    const ctx = await fetchLentilleContext(`https://www.luogu.com.cn/problem/solution/${pid.value}`)
    if (!ctx || ctx.__needLogin) {
      errorMsg.value = '请先登录洛谷后查看题解'
      loading.value = false; return
    }

    const cd = ctx?.currentData || ctx?.data || {}
    problemTitle.value = cd.problem?.title || cd.problem?.name || pid.value

    const raw = cd.solutions?.result || cd.solutions || []
    solutions.value = raw.map((s: any) => ({
      id: s.id || 0,
      title: s.title || '',
      time: s.time || s.postTime || 0,
      author: s.author || s.user || {},
      content: s.content || '',
      upvoteCount: s.upvoteCount || s.voteCount || 0,
      replyCount: s.replyCount || s.commentCount || 0,
      verified: s.verified || s.status === 2 || false,
      isOfficial: s.isOfficial || s.official || false,
    }))
  } catch (e: any) { errorMsg.value = friendlyError(e) }
  loading.value = false
}

// ============================================================
// Fetch single solution detail
// ============================================================
async function fetchSolutionDetail(id: number) {
  detailLoading.value = true
  try {
    const ctx = await fetchLentilleContext(`https://www.luogu.com.cn/problem/solution/${pid.value}/${id}`)
    if (ctx?.__needLogin) { errorMsg.value = '请先登录洛谷后查看题解'; detailLoading.value = false; return }
    const cd = ctx?.currentData || ctx?.data || {}
    const s = cd.solution || cd
    if (s) {
      detail.value = {
        id: s.id || id,
        title: s.title || '',
        time: s.time || s.postTime || 0,
        author: s.author || s.user || {},
        content: s.content || '',
        upvoteCount: s.upvoteCount || s.voteCount || 0,
        replyCount: s.replyCount || s.commentCount || 0,
        verified: s.verified || s.status === 2 || false,
        isOfficial: s.isOfficial || s.official || false,
      }
    }
  } catch {}
  detailLoading.value = false
}

// ============================================================
// Navigation
// ============================================================
function openSolution(s: Solution) {
  navigateTo(AppPage.Solution, `https://www.luogu.com.cn/problem/solution/${pid.value}/${s.id}`)
}
function backToList() {
  navigateTo(AppPage.Solution, `https://www.luogu.com.cn/problem/solution/${pid.value}`)
}
function openProblem() {
  navigateTo(AppPage.ProblemDetail, `https://www.luogu.com.cn/problem/${pid.value}`)
}
function openUser(uid: number) {
  window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank')
}

function loadContent() {
  if (solutionId.value) { detail.value = null; fetchSolutionDetail(solutionId.value) }
  else { detail.value = null; fetchSolutions() }
}

onMounted(loadContent)
watch(solutionId, () => loadContent())
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <!-- ============================================================ -->
    <!-- Detail View -->
    <!-- ============================================================ -->
    <template v-if="solutionId">
      <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
        <button @click="backToList" style="background:none;border:none;cursor:pointer;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)" mb-2>← 返回题解列表</button>
        <h1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">{{ detail?.title || '加载中...' }}</h1>
        <div v-if="detail" flex="~ items-center gap-3" mt-2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-3)">
          <img :src="detail.author?.avatar" style="width:24px;height:24px;border-radius:50%;object-fit:cover" @error="(e:any)=>{e.target.style.display='none'}">
          <span :style="{color:detail.author?.color?`var(--bew-${detail.author.color})`:'var(--bew-text-1)'}">{{ detail.author?.name }}</span>
          <span>{{ new Date((detail.time||0)*1000).toLocaleString('zh-CN') }}</span>
          <span v-if="detail.verified" style="color:var(--bew-success-color);font-weight:600">✓ 已认证</span>
        </div>
      </div>
      <Loading v-if="detailLoading" />
      <Transition name="content-reveal">
        <div v-if="!detailLoading && detail" bg="$bew-content" rounded="$bew-radius" p-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <div class="markdown-body" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);line-height:1.8" v-html="parseMarkdownContent(detail.content || '*(无内容)*')" />
        </div>
      </Transition>
    </template>

    <!-- ============================================================ -->
    <!-- List View -->
    <!-- ============================================================ -->
    <template v-else>
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
            v-for="(s, idx) in solutions" :key="s.id"
            class="stagger-row hover:bg-$bew-fill-2"
            :style="{ '--row-index': idx }"
            p="x-6 y-4" flex="~ items-center gap-4" cursor="pointer"
            border="b-1 $bew-border-color" duration-200
            @click="openSolution(s)"
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
              <span flex="~ items-center gap-1"><span v-html="renderIcon('mingcute:arrow-up-line', 14)" style="display:contents"/>{{ s.upvoteCount }}</span>
              <span flex="~ items-center gap-1"><span v-html="renderIcon('mingcute:comment-line', 14)" style="display:contents"/>{{ s.replyCount }}</span>
              <span>{{ timeAgo(s.time) }}</span>
            </div>
          </div>
        </div>
      </Transition>

      <div v-if="!loading && !errorMsg && solutions.length === 0" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" style="text-align:center;color:var(--bew-text-3);font-size:var(--bew-base-font-size);backdrop-filter:var(--bew-filter-glass-1)">
        <span v-html="renderIcon('mingcute:bulb-line', 48)" style="display:contents" /><p mt-2>暂无题解</p>
      </div>
    </template>
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
