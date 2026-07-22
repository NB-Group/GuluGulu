<script setup lang="ts">
import { useGuluApp } from '~/composables/useAppProvider'
import { AppPage } from '~/enums/appEnums'
import { renderIcon } from '~/utils/icons'
import { friendlyError } from '~/utils/luogu-api'
import { timeAgo } from '~/utils/main'

const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const { currentUrl, navigateTo } = useGuluApp()

// ============================================================
// Type taxonomy (洛谷标准, 2026-07 抓包确认)
// 1=回复我的 2=评论 3=点赞 4=系统 5=提及 6=收藏
// ============================================================
interface TabDef { key: number, label: string, icon: string }
const TABS: TabDef[] = [
  { key: 0, label: '全部', icon: 'mingcute:notification-line' },
  { key: 1, label: '回复', icon: 'mingcute:message-2-line' },
  { key: 2, label: '评论', icon: 'mingcute:comment-line' },
  { key: 3, label: '点赞', icon: 'mingcute:thumb-up-line' },
  { key: 4, label: '系统', icon: 'mingcute:settings-3-line' },
  { key: 5, label: '提及', icon: 'mingcute:hashtag-line' },
  { key: 6, label: '收藏', icon: 'mingcute:bookmark-line' },
]

function typeIcon(t: number): string {
  return TABS.find(x => x.key === t)?.icon || 'mingcute:notification-line'
}
function typeLabel(t: number): string {
  return TABS.find(x => x.key === t)?.label || ''
}

// ============================================================
// State
// ============================================================
interface NotificationItem {
  id: number
  type: number
  title?: string
  content?: string
  time: number
  unread?: boolean
}

const items = ref<NotificationItem[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const errorMsg = ref('')
const totalCount = ref(0)
const currentPage = ref(1)
const pageSize = 20
const unreadTypes = ref<number[]>([])

const activeType = computed(() => {
  const m = currentUrl.value.match(/[?&]type=(\d+)/)
  return m ? Number(m[1]) : 0
})
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))
const sentinelRef = ref<HTMLDivElement>()

// ============================================================
// Fetch
// ============================================================
async function fetchList(append = false) {
  if (append)
    loadingMore.value = true
  else loading.value = true
  errorMsg.value = ''
  try {
    const params = new URLSearchParams()
    if (activeType.value)
      params.set('type', String(activeType.value))
    if (currentPage.value > 1)
      params.set('page', String(currentPage.value))
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`https://www.luogu.com.cn/user/notification${qs}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const raw = ctx?.data?.notifications
      const result: any[] = Array.isArray(raw) ? raw : (raw?.result || [])
      const mapped = result.map(n => ({
        id: n?.id ?? 0,
        type: n?.type ?? 0,
        title: n?.title || '',
        content: n?.content || '',
        time: n?.time || 0,
        unread: !!n?.unread,
      }))
      items.value = append ? [...items.value, ...mapped] : mapped
      totalCount.value = raw?.count ?? mapped.length
      if (!append)
        unreadTypes.value = ctx?.data?.unreadTypes || []
    }
    else {
      errorMsg.value = '请先登录洛谷'
    }
  }
  catch (e: any) {
    errorMsg.value = friendlyError(e)
  }
  finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadMore() {
  if (loadingMore.value || loading.value || currentPage.value >= totalPages.value)
    return
  currentPage.value++
  fetchList(true)
}

// ============================================================
// Tab switching & URL sync
// ============================================================
function switchTab(key: number) {
  if (key === activeType.value)
    return
  currentPage.value = 1
  items.value = []
  const qs = key ? `?type=${key}` : ''
  navigateTo(AppPage.Notification, `https://www.luogu.com.cn/user/notification${qs}`)
}

// ============================================================
// SPA link interception inside v-html content
// 洛谷 content 含 <a href="/problem/.."> 等相对链接,拦截成 SPA 跳转。
// ============================================================
// 支持的 SPA 路径前缀 (来自 App.vue getPageFromUrl)
const SPA_ROUTE_RE = /^\/(problem\/(list|solution|\w+)|contest\/(list|\d+)|ranking|discuss\/?\d*|blog|user\/(\d+|mine\/\w+)|training\/(list|\d+)|team\/\d+|record\/\d+|article)/i
function handleContentClick(e: MouseEvent) {
  const target = (e.target as HTMLElement)?.closest('a') as HTMLAnchorElement | null
  if (!target)
    return
  const href = target.getAttribute('href') || ''
  if (!href || href.startsWith('javascript:') || href.startsWith('#'))
    return
  // 绝对外链 → 新标签打开
  if (/^https?:\/\//i.test(href)) {
    if (!href.includes('luogu.com.cn')) {
      target.target = '_blank'
      target.rel = 'noopener'
      return
    }
  }
  // 提取路径部分,带 query
  let path = href
  if (href.startsWith('https://www.luogu.com.cn')) {
    try { path = new URL(href).pathname + new URL(href).search }
    catch { path = href.replace(/^https?:\/\/[^/]+/i, '') }
  }
  if (path.startsWith('/')) {
    if (SPA_ROUTE_RE.test(path)) {
      e.preventDefault()
      e.stopPropagation()
      // 映射 path → AppPage(借助 App.vue 的 getPageFromUrl 等价逻辑)
      navigateTo(AppPage.Notification, `https://www.luogu.com.cn${path}`)
      // navigateTo 会根据 url 切换 AppPage,即使当前页传 Notification 也无妨——
      // 它内部用 getPageFromUrl 解析,所以会正确落到 ProblemDetail/Blog 等。
      return
    }
    // 其余洛谷路径保险起见新标签打开
    target.target = '_blank'
    target.rel = 'noopener'
  }
}

// ============================================================
// Lifecycle
// ============================================================
let obs: IntersectionObserver | null = null
function bindObserver() {
  obs?.disconnect()
  obs = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && !loading.value && !loadingMore.value)
        loadMore()
    },
    { rootMargin: '1200px' },
  )
  nextTick(() => {
    if (obs && sentinelRef.value)
      obs.observe(sentinelRef.value)
  })
}

let lastType = -1
function reload() {
  if (lastType === activeType.value)
    return
  lastType = activeType.value
  currentPage.value = 1
  items.value = []
  fetchList(false).then(() => bindObserver())
}

onMounted(() => { reload() })
watch(() => currentUrl.value, () => {
  // URL 变(切 tab 或外部跳回)→ 重新拉取
  reload()
})
watch(sentinelRef, (el) => {
  if (el && obs)
    obs.observe(el)
})
onUnmounted(() => obs?.disconnect())
</script>

<template>
  <div :class="{ 'page-container': !props.embedded }" w-full h-full :p="props.embedded ? '' : 'x-4 md:x-8 lg:x-16'" pos="relative">
    <!-- 顶部:标题 + 分类 tab -->
    <div
      v-if="!props.embedded" bg="$bew-content" rounded="$bew-radius" mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 $bew-border-color" overflow="hidden" style="backdrop-filter:var(--bew-filter-glass-1)"
    >
      <div class="notif-hero-accent" />
      <div flex="~ items-center gap-3" p="6">
        <span style="display:contents;color:var(--bew-theme-color)" v-html="renderIcon('mingcute:notification-line', 26)" />
        <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:800;margin:0">
          通知
        </h1>
        <span v-if="totalCount" class="chip" ml-auto>{{ totalCount }} 条</span>
      </div>
      <!-- 分类 tab (UnderlineNav) -->
      <nav class="notif-tabs">
        <button
          v-for="t in TABS" :key="t.key"
          class="notif-tab" :class="{ 'notif-tab--active': activeType === t.key }"
          @click="switchTab(t.key)"
        >
          <span style="display:contents" v-html="renderIcon(t.icon, 15)" />
          {{ t.label }}
          <span
            v-if="t.key !== 0 && unreadTypes.includes(t.key)"
            class="notif-tab-dot"
          />
        </button>
      </nav>
    </div>

    <!-- 加载中 -->
    <Loading v-if="loading" />

    <!-- 错误 -->
    <div
      v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color"
      text="center $bew-text-2"
    >
      <span style="display:contents" v-html="renderIcon('mingcute:warning-line', 32)" />
      <p mt-2>
        {{ errorMsg }}
      </p>
    </div>

    <!-- 列表 -->
    <Transition name="content-reveal">
      <div
        v-if="!loading && !errorMsg && items.length > 0"
        bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1)]"
        border="1 $bew-border-color" overflow="hidden"
      >
        <div
          v-for="(n, idx) in items" :key="n.id || idx"
          class="stagger-row notif-item"
          :style="{ '--row-index': idx, 'opacity': 1 }"
          border="b-1 $bew-border-color"
          p="x-5 y-3.5"
          flex="~ items-start gap-3"
        >
          <!-- 未读指示点(叠加在图标上) -->
          <div flex-shrink-0 pos="relative" mt-1>
            <span
              :style="{ color: 'var(--bew-theme-color)', display: 'contents' }"
              v-html="renderIcon(typeIcon(n.type), 20)"
            />
            <span v-if="n.unread" class="unread-dot" />
          </div>
          <!-- 内容主体 -->
          <div flex="1" min-w-0>
            <div
              class="notif-content"
              style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);line-height:1.6"
              @click="handleContentClick"
              v-html="n.content || n.title || '&nbsp;'"
            />
            <div flex="~ items-center gap-3 wrap" mt-1 style="font-size:.75em;color:var(--bew-text-3)">
              <span v-if="n.type" class="type-tag">{{ typeLabel(n.type) }}</span>
              <span>{{ timeAgo(n.time) }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 空态 -->
    <div
      v-if="!loading && !errorMsg && items.length === 0" bg="$bew-content" rounded="$bew-radius" p-8 text="center $bew-text-3"
      border="1 $bew-border-color" flex="~ col items-center" gap-3
    >
      <span style="display:contents" v-html="renderIcon('mingcute:notification-off-line', 48)" />
      <p>暂无通知</p>
    </div>

    <!-- 加载更多 sentinel -->
    <Loading v-if="loadingMore" />
    <div
      v-if="!loading && !errorMsg && items.length > 0 && currentPage < totalPages"
      ref="sentinelRef" style="height:60px;display:flex;align-items:center;justify-content:center"
      text="sm $bew-text-3"
    >
      向下滚动加载更多...
    </div>
    <div v-if="!loading && !errorMsg && items.length > 0 && currentPage >= totalPages && totalPages > 1" text="sm $bew-text-3" text-center pb-8>
      已加载全部 {{ totalCount }} 条通知
    </div>
  </div>
</template>

<style lang="scss" scoped>
.notif-hero-accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(
    90deg,
    var(--bew-theme-color),
    color-mix(in oklab, var(--bew-theme-color), transparent 60%)
  );
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--bew-fill-2);
  color: var(--bew-text-2);
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 500;
  white-space: nowrap;
}

/* UnderlineNav (GitHub) */
.notif-tabs {
  display: flex;
  align-items: stretch;
  gap: 4px;
  padding: 0 16px;
  border-top: 1px solid var(--bew-border-color);
  border-bottom: 1px solid var(--bew-border-color);
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}
.notif-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 12px 14px;
  margin-bottom: -1px;
  color: var(--bew-text-3);
  font-size: var(--bew-base-font-size);
  font-weight: 500;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition:
    color var(--bew-dur-fast),
    border-color var(--bew-dur-fast);
  & span:first-child {
    display: contents;
  }
  &:hover {
    color: var(--bew-text-1);
    border-bottom-color: var(--bew-border-color);
  }
}
.notif-tab--active {
  color: var(--bew-text-1);
  font-weight: 600;
  border-bottom-color: var(--bew-theme-color);
}
.notif-tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--bew-theme-color);
  margin-left: 2px;
}

/* 列表项 */
.notif-item {
  transition: background var(--bew-dur-fast);
  &:hover {
    background: var(--bew-fill-2);
  }
}
.unread-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bew-theme-color);
  border: 2px solid var(--bew-content);
  box-sizing: content-box;
}
.type-tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--bew-fill-2);
  color: var(--bew-text-2);
  font-size: 0.9em;
}

/* v-html 里的内容链接样式 */
.notif-content {
  :deep(a) {
    color: var(--bew-theme-color);
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
  :deep(img) {
    max-width: 100%;
    border-radius: var(--bew-radius);
  }
  :deep(code) {
    font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", monospace;
    background: var(--bew-fill-2);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
  }
}
</style>
