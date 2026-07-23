<script setup lang="ts">
import { useGuluApp } from '~/composables/useAppProvider'
import { AppPage } from '~/enums/appEnums'
import { renderIcon } from '~/utils/icons'
import { friendlyError, getCsrfToken, isLoggedIn as checkLuoguLogin } from '~/utils/luogu-api'
import { timeAgo } from '~/utils/main'
import { parseMarkdownContent } from '~/utils/markdown'

const { currentUrl, navigateTo } = useGuluApp()

// 分类映射(洛谷专栏固定 6 类)
const catLabels: Record<number, string> = { 1: '算法', 2: '游记', 3: '题解', 4: '杂谈', 5: '科技', 6: '生活' }
const categoryOptions: { label: string, value: number | '' }[] = [
  { label: '全部', value: '' },
  ...Object.keys(catLabels).map(k => ({ label: catLabels[Number(k)]!, value: Number(k) })),
]

interface ArticleAuthor {
  uid: number
  avatar: string
  name: string
  slogan?: string
  badge?: string | null
  color?: string
  ccfLevel?: number
}
interface ArticleSummary {
  lid: string
  title: string
  category: number
  time: number
  author: ArticleAuthor
  upvote: number
  replyCount: number
  favorCount: number
  status?: number
}

// ===== 列表状态 =====
const articles = ref<ArticleSummary[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const errorMsg = ref('')
const currentPage = ref(1)
const totalCount = ref(0)
const pageSize = 15
const sentinelRef = ref<HTMLDivElement>()
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))
const isLoggedIn = computed(() => checkLuoguLogin())

// "我的专栏" 模式
const isMine = computed(() => /\/article\/mine(?:[/?#]|$)/i.test(currentUrl.value))
const mineStat = ref<{ promoted: number, public: number, hidden: number } | null>(null)

// 分类筛选
const selectedCategory = ref<number | ''>('')
function changeCategory(cat: number | '') {
  if (selectedCategory.value === cat)
    return
  selectedCategory.value = cat
  currentPage.value = 1
  articles.value = []
  fetchArticles()
}

// 从 URL 解析 lid(避开 /article/mine)
const articleLid = computed<string | null>(() => {
  const m = currentUrl.value.match(/\/article\/([^/?#]+)/i)
  if (!m)
    return null
  const id = m[1]
  if (id === 'mine')
    return null
  return id
})

// ===== 详情状态 =====
const detail = ref<any>(null)
const detailLoading = ref(false)
const detailError = ref('')
const replies = ref<any[]>([])
const repliesLoading = ref(false)
// 点赞
const voteSending = ref(false)
const voteError = ref('')
// 评论发表
const replyContent = ref('')
const replyError = ref('')
const replySending = ref(false)
// 洛谷评论强制图形验证码,端点必须是 /lg4/captcha(同讨论回复机制)
const captchaSrc = ref('')
const captchaCode = ref('')
function loadReplyCaptcha() {
  captchaCode.value = ''
  // _t 带随机小数,仅作 cache-buster(同原生 Date.now()+Math.random())
  captchaSrc.value = `https://www.luogu.com.cn/lg4/captcha?_t=${Date.now() + Math.random()}`
}

// 抓 lentille-context 的公共解析
function parseLentille(html: string): any | null {
  const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
  if (!m?.[1])
    return null
  try { return JSON.parse(m[1]) }
  catch { return null }
}

// ===== 列表抓取(支持 ?page=N & ?category=N & /article/mine) =====
async function fetchArticles(append = false) {
  if (append)
    loadingMore.value = true
  else loading.value = true
  errorMsg.value = ''
  try {
    const params = new URLSearchParams()
    if (currentPage.value > 1)
      params.set('page', String(currentPage.value))
    if (selectedCategory.value !== '')
      params.set('category', String(selectedCategory.value))
    const qs = params.toString() ? `?${params.toString()}` : ''
    const base = isMine.value ? 'https://www.luogu.com.cn/article/mine' : 'https://www.luogu.com.cn/article'
    const res = await fetch(`${base}${qs}`, { credentials: 'same-origin' })
    const html = await res.text()
    const ctx = parseLentille(html)
    if (ctx?.data) {
      const r = ctx.data.articles
      if (r && typeof r === 'object') {
        const list: ArticleSummary[] = r.result || []
        articles.value = append ? [...articles.value, ...list] : list
        totalCount.value = r.count || 0
      }
      else {
        if (!append)
          articles.value = []
        errorMsg.value = '数据格式不匹配'
      }
      // "我的专栏" 统计
      if (isMine.value && ctx.data.stat) {
        const s = ctx.data.stat
        mineStat.value = { promoted: s.promoted ?? 0, public: s.public ?? 0, hidden: s.hidden ?? 0 }
      }
      else {
        mineStat.value = null
      }
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
  fetchArticles(true)
}

// ===== 详情抓取 =====
async function fetchDetail(lid: string) {
  detailLoading.value = true
  detailError.value = ''
  detail.value = null
  replies.value = []
  try {
    const res = await fetch(`https://www.luogu.com.cn/article/${lid}`, { credentials: 'same-origin' })
    const html = await res.text()
    const ctx = parseLentille(html)
    if (ctx?.data?.article) {
      detail.value = ctx.data.article
    }
    else {
      detailError.value = '请先登录洛谷或文章不存在'
    }
  }
  catch (e: any) {
    detailError.value = friendlyError(e)
  }
  detailLoading.value = false
  // 评论单独接口
  fetchReplies(lid)
  // 进入详情即预取验证码(同讨论回复,原生行为)
  loadReplyCaptcha()
}

async function fetchReplies(lid: string) {
  repliesLoading.value = true
  try {
    const res = await fetch(`https://www.luogu.com.cn/article/${lid}/replies`, { credentials: 'same-origin' })
    const json = await res.json().catch(() => null)
    if (json && Array.isArray(json.replySlice)) {
      replies.value = json.replySlice
    }
    else if (json && Array.isArray(json.replies)) {
      replies.value = json.replies
    }
    else {
      replies.value = []
    }
  }
  catch {
    replies.value = []
  }
  repliesLoading.value = false
}

// ===== 投票:1=赞,-1=踩(不喜欢),0=取消;同一态再点=取消 =====
async function voteArticle(v: 1 | -1) {
  const lid = articleLid.value
  if (!lid || voteSending.value || !detail.value)
    return
  const cur = Number(detail.value.voted) || 0
  const wantVote: number = cur === v ? 0 : v
  voteSending.value = true
  voteError.value = ''
  try {
    const csrf = getCsrfToken()
    const res = await fetch(`https://www.luogu.com.cn/article/${lid}/vote?vote=${wantVote}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: '{}',
    })
    const json = await res.json().catch(() => ({}))
    const voted = typeof json.voted === 'number' ? json.voted : json.data?.voted
    const upvotes = typeof json.upvotes === 'number' ? json.upvotes : json.data?.upvotes
    if (voted !== undefined) {
      // voted 可能是 1/-1/0;保留数值态方便高亮判断
      detail.value = { ...detail.value, voted, upvote: upvotes ?? detail.value.upvote }
    }
    else {
      voteError.value = json?.errorMessage || json?.data || json?.msg || '操作失败'
    }
  }
  catch (e: any) {
    voteError.value = friendlyError(e)
  }
  voteSending.value = false
}

// ===== 收藏 / 取消收藏 =====
const favorSending = ref(false)
async function toggleFavor() {
  const lid = articleLid.value
  if (!lid || favorSending.value || !detail.value)
    return
  const favored = !!detail.value.favored
  favorSending.value = true
  try {
    const csrf = getCsrfToken()
    const res = await fetch(`https://www.luogu.com.cn/article/${lid}/favor${favored ? '?remove=1' : ''}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: '{}',
    })
    const json = await res.json().catch(() => ({}))
    if (json.lid !== undefined || res.ok) {
      detail.value = {
        ...detail.value,
        favored: !favored,
        favorCount: Math.max(0, (detail.value.favorCount || 0) + (favored ? -1 : 1)),
      }
    }
    else {
      voteError.value = json?.errorMessage || json?.data || json?.msg || '操作失败'
    }
  }
  catch (e: any) {
    voteError.value = friendlyError(e)
  }
  favorSending.value = false
}

// ===== 发表评论(best-effort:照讨论回复模式) =====
async function postReply() {
  const lid = articleLid.value
  const text = replyContent.value.trim()
  if (!lid || !text || replySending.value)
    return
  replySending.value = true
  replyError.value = ''
  const hadCaptcha = !!captchaCode.value
  try {
    const csrf = getCsrfToken()
    // 验证码放 body(同讨论回复),不是 header
    const body: Record<string, string> = { content: text }
    if (captchaCode.value)
      body.captcha = captchaCode.value
    const res = await fetch(`https://www.luogu.com.cn/article/${lid}/replies`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    const needCaptcha
      = json?.errorType?.includes('Captcha')
        || json?.errorMessage?.includes('验证码')
        || json?.data?.includes?.('验证码')
    if (needCaptcha) {
      replyError.value = hadCaptcha ? '验证码错误,请重输' : '请输入下方验证码后再回复'
      loadReplyCaptcha()
      replySending.value = false
      return
    }
    const newId = json?.reply?.id || json?.id || json?.rid
    if (json.code === 200 || newId || json?.status === 200) {
      replies.value.push({
        id: newId || Date.now(),
        author: json?.reply?.author || {
          uid: Number((window as any).__gulu_user?.uid) || 0,
          name: (window as any).__gulu_user?.name || '',
          avatar: `https://cdn.luogu.com.cn/upload/usericon/${(window as any).__gulu_user?.uid || 0}.png`,
          color: '',
        },
        time: json?.reply?.time || Math.floor(Date.now() / 1000),
        content: text,
      })
      replyContent.value = ''
      loadReplyCaptcha()
    }
    else {
      replyError.value = json?.errorMessage || json?.data || json?.msg || '回复失败'
    }
  }
  catch (e: any) {
    replyError.value = friendlyError(e)
  }
  replySending.value = false
}

function openArticle(lid: string) {
  navigateTo(AppPage.Article, `https://www.luogu.com.cn/article/${lid}`)
}
function goBackToList() {
  if (window.history.length > 1)
    history.back()
  else navigateTo(AppPage.Article, 'https://www.luogu.com.cn/article')
}

// URL → 加载内容(列表 vs 详情 vs 我的)
function loadContent() {
  if (articleLid.value) {
    // 详情模式
    fetchDetail(articleLid.value)
  }
  else {
    // 列表 / 我的模式
    detail.value = null
    captchaSrc.value = ''
    captchaCode.value = ''
    currentPage.value = 1
    articles.value = []
    // 从 URL 同步 category
    const cm = currentUrl.value.match(/[?&]category=(\d+)/i)
    selectedCategory.value = cm ? Number(cm[1]) : ''
    mineStat.value = null
    fetchArticles()
  }
}
onMounted(loadContent)
watch(articleLid, () => loadContent())
watch(isMine, () => {
  // mine 切换时若是列表态则重新加载
  if (!articleLid.value)
    loadContent()
})

// 无限滚动 sentinel
let obs: IntersectionObserver | null = null
onMounted(() => {
  obs = new IntersectionObserver(
    (e) => {
      if (e[0]?.isIntersecting && !loading.value && !loadingMore.value)
        loadMore()
    },
    { rootMargin: '1200px' },
  )
  nextTick(() => {
    if (obs && sentinelRef.value)
      obs.observe(sentinelRef.value)
  })
})
watch(sentinelRef, (el) => {
  obs?.disconnect(); if (el)
    obs?.observe(el as Element)
})
onUnmounted(() => obs?.disconnect())
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <!-- 未登录拦截 -->
    <div
      v-if="!isLoggedIn"
      bg="$bew-content" rounded="$bew-radius" p-8 mb-6
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 $bew-border-color" text="center"
      style="backdrop-filter: var(--bew-filter-glass-1)"
    >
      <span style="display:contents; color: var(--bew-warning-color);" v-html="renderIcon('mingcute:lock-line', 40)" />
      <p mt-3 fw-bold text="xl $bew-text-1">
        请先登录洛谷
      </p>
      <p mt-1 text="sm $bew-text-2">
        专栏浏览与互动需要登录状态
      </p>
      <a
        href="https://www.luogu.com.cn/auth/login" target="_blank" mt-4 inline-block p="x-4 y-2"
        rounded="$bew-radius-half" text-white style="background:var(--bew-theme-color);text-decoration:none"
      >前往登录</a>
    </div>

    <!-- ============ 详情视图 ============ -->
    <template v-if="isLoggedIn && articleLid">
      <div
        bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
        border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)"
      >
        <button style="background:none;border:none;cursor:pointer;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)" mb-2 @click="goBackToList">
          ← 返回
        </button>
        <h1 style="font-size:1.4rem;color:var(--bew-text-1);font-weight:700">
          {{ detail?.title || '加载中...' }}
        </h1>
        <div v-if="detail" flex="~ items-center gap-3 wrap" mt-2 style="font-size:.9em;color:var(--bew-text-3)">
          <img :src="detail.author?.avatar" style="width:24px;height:24px;border-radius:50%;object-fit:cover" @error="(e:any) => { e.target.style.display = 'none' }">
          <span :style="{ color: detail.author?.color ? `var(--bew-${detail.author.color})` : 'var(--bew-text-1)' }" fw-bold>{{ detail.author?.name }}</span>
          <span
            v-if="detail.category" text="xs white" px-2 py-0.5 rounded-full
            :style="{ background: 'var(--bew-theme-color)' }"
          >{{ catLabels[detail.category] || '其他' }}</span>
          <span>{{ timeAgo(detail.time) }}</span>
        </div>
      </div>

      <Loading v-if="detailLoading" />
      <div
        v-if="!detailLoading && detailError" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color"
        text="center $bew-text-2"
      >
        <span style="display:contents" v-html="renderIcon('mingcute:warning-line', 32)" />
        <p mt-2>
          {{ detailError }}
        </p>
      </div>

      <Transition name="content-reveal">
        <div
          v-if="!detailLoading && detail" bg="$bew-content" rounded="$bew-radius" p-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
          border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)"
        >
          <div class="markdown-body" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);line-height:1.8" v-html="parseMarkdownContent(detail.content || '*(无内容)*')" />

          <!-- 互动栏:赞 / 踩 / 评论 / 收藏 —— 统一 chip 样式 -->
          <div mt-6 pt-4 border="t-1 $bew-border-color" flex="~ items-center gap-2 wrap">
            <button
              class="gulu-art-chip"
              :class="{ 'gulu-art-chip--active': Number(detail.voted) === 1 }"
              :disabled="voteSending"
              @click="voteArticle(1)"
            >
              <span class="gulu-art-chip-ico" v-html="renderIcon('mingcute:thumb-up-line', 16)" />
              <span>{{ detail.upvote ?? 0 }}</span>
            </button>
            <button
              class="gulu-art-chip"
              :class="{ 'gulu-art-chip--active-warn': Number(detail.voted) === -1 }"
              :disabled="voteSending"
              :title="Number(detail.voted) === -1 ? '已踩,再次点击取消' : '不喜欢'"
              @click="voteArticle(-1)"
            >
              <span class="gulu-art-chip-ico" v-html="renderIcon('mingcute:thumb-down-line', 16)" />
              <span>踩</span>
            </button>
            <span class="gulu-art-chip gulu-art-chip--static">
              <span class="gulu-art-chip-ico" v-html="renderIcon('mingcute:comment-line', 16)" />
              <span>{{ detail.replyCount ?? replies.length }}</span>
            </span>
            <button
              class="gulu-art-chip"
              :class="{ 'gulu-art-chip--active': detail.favored }"
              :disabled="favorSending"
              @click="toggleFavor"
            >
              <span class="gulu-art-chip-ico" v-html="renderIcon('mingcute:star-line', 16)" />
              <span>{{ detail.favorCount ?? 0 }}</span>
            </button>
          </div>
          <div v-if="voteError" mt-2 p-2 rounded="$bew-radius" style="background:var(--bew-error-color-20);color:var(--bew-error-color);font-size:.85em">
            {{ voteError }}
          </div>

          <!-- 评论列表 -->
          <div mt-8 pt-6 border="t-1 $bew-border-color">
            <h3 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700" mb-4>
              {{ replies.length }} 条评论
            </h3>

            <Loading v-if="repliesLoading" />
            <div v-else-if="replies.length > 0" flex="~ col" gap-3 mb-6>
              <div
                v-for="r in replies" :key="r.id" class="reply-item" p-4 rounded="$bew-radius"
                bg="$bew-fill-1"
              >
                <div flex="~ items-center gap-2" mb-2>
                  <img :src="r.author?.avatar" style="width:22px;height:22px;border-radius:50%;object-fit:cover" @error="(e:any) => { e.target.style.display = 'none' }">
                  <span :style="{ color: r.author?.color ? `var(--bew-${r.author.color})` : 'var(--bew-text-1)', fontWeight: 600, fontSize: 'var(--bew-base-font-size)' }">{{ r.author?.name }}</span>
                  <span style="font-size:.8em;color:var(--bew-text-4)">{{ timeAgo(r.time) }}</span>
                </div>
                <div class="markdown-body" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);line-height:1.6" v-html="parseMarkdownContent(r.content || '')" />
              </div>
            </div>
            <div v-else class="empty-state-fade" text="center $bew-text-3" py-6 style="font-size:.9em">
              暂无评论
            </div>

            <!-- 评论输入 -->
            <div flex="~ items-end gap-2">
              <textarea
                v-model="replyContent"
                style="flex:1;background:var(--bew-fill-1);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:var(--bew-radius);padding:8px 12px;font-size:var(--bew-base-font-size);resize:none;min-height:60px;max-height:150px;font-family:inherit;outline:none"
                placeholder="写下你的评论..."
                @keydown.enter.ctrl="postReply"
              />
              <button
                style="background:var(--bew-theme-color);color:white;border:none;border-radius:var(--bew-radius);padding:8px 20px;cursor:pointer;font-size:var(--bew-base-font-size);font-weight:600;white-space:nowrap"
                :disabled="replySending || !replyContent.trim()"
                :style="{ opacity: (replySending || !replyContent.trim()) ? .5 : 1 }"
                @click="postReply"
              >
                {{ replySending ? '发送中...' : '评论' }}
              </button>
            </div>
            <!-- 验证码(洛谷写操作强制要求) -->
            <div
              v-if="captchaSrc" mt-2 flex="~ items-center gap-2" p-2 rounded="$bew-radius"
              bg="$bew-fill-1"
            >
              <img :src="captchaSrc" style="height:36px;border-radius:4px;cursor:pointer" title="点击刷新" alt="验证码" @click="loadReplyCaptcha">
              <input v-model="captchaCode" placeholder="输入验证码" style="flex:1;padding:6px 10px;background:var(--bew-bg);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:4px;font-size:.85em;outline:none" @keydown.enter="postReply">
              <span style="font-size:.7em;color:var(--bew-text-3)">填好后点评论</span>
            </div>
            <div v-if="replyError" mt-2 p-2 rounded="$bew-radius" style="background:var(--bew-error-color-20);color:var(--bew-error-color);font-size:.85em">
              {{ replyError }}
            </div>
          </div>
        </div>
      </Transition>
    </template>

    <!-- ============ 列表视图(含我的专栏) ============ -->
    <template v-else-if="isLoggedIn">
      <div
        bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
        border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)"
      >
        <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:700" mb-2>
          {{ isMine ? '我的专栏' : '专栏' }}
        </h1>
        <p text="$bew-text-2">
          共 {{ totalCount }} 篇文章
        </p>
        <!-- 我的专栏统计 -->
        <div v-if="isMine && mineStat" flex="~ gap-4 wrap" mt-3>
          <span px-3 py-1 rounded="$bew-radius" bg="$bew-fill-2" text="sm">
            <span text="$bew-text-3">已推广</span> <b text="$bew-text-1">{{ mineStat.promoted }}</b>
          </span>
          <span px-3 py-1 rounded="$bew-radius" bg="$bew-fill-2" text="sm">
            <span text="$bew-text-3">公开</span> <b text="$bew-text-1">{{ mineStat.public }}</b>
          </span>
          <span px-3 py-1 rounded="$bew-radius" bg="$bew-fill-2" text="sm">
            <span text="$bew-text-3">隐藏</span> <b text="$bew-text-1">{{ mineStat.hidden }}</b>
          </span>
        </div>
        <!-- 分类筛选 -->
        <div v-if="!isMine" flex="~ gap-1.5 wrap" mt-3>
          <span
            v-for="(label, key) in categoryOptions"
            :key="key"
            text="xs" px-3 py-1 rounded-full cursor="pointer"
            fw-bold
            :style="selectedCategory === label.value ? { background: 'var(--bew-theme-color)', color: '#fff' } : { background: 'var(--bew-fill-2)', color: 'var(--bew-text-2)' }"
            @click="changeCategory(label.value)"
          >{{ label.label }}</span>
        </div>
      </div>

      <Loading v-if="loading" />
      <div
        v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color"
        text="center $bew-text-2"
      >
        <span style="display:contents" v-html="renderIcon('mingcute:warning-line', 32)" />
        <p mt-2>
          {{ errorMsg }}
        </p>
      </div>

      <Transition name="content-reveal">
        <div
          v-if="!loading && articles.length > 0" bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color"
          style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden"
        >
          <div
            v-for="(a, idx) in articles"
            :key="a.lid"
            class="stagger-row hover:bg-$bew-fill-2"
            :style="{ '--row-index': idx }"
            p="x-4 md:x-6 y-3.5"
            flex="~ items-center gap-3"
            cursor="pointer"
            border="b-1 $bew-border-color"
            duration-200
            @click="openArticle(a.lid)"
          >
            <div flex-1 min-w-0>
              <div flex="~ items-center gap-2">
                <span
                  v-if="a.category" text="xs white" px-1.5 py-0.5 rounded-full
                  shrink-0 :style="{ background: 'var(--bew-theme-color)' }" fw-bold
                >{{ catLabels[a.category] || '其他' }}</span>
                <h3 text="base $bew-text-1" fw-bold overflow-hidden style="text-overflow:ellipsis;white-space:nowrap">
                  {{ a.title }}
                </h3>
              </div>
              <div flex="~ items-center gap-2 wrap" mt-1 text="xs $bew-text-3">
                <div flex="~ items-center gap-1">
                  <img :src="a.author?.avatar" style="width:16px;height:16px;border-radius:50%;object-fit:cover" @error="(e:any) => { e.target.style.display = 'none' }">
                  <span :style="{ color: a.author?.color ? `var(--bew-${a.author.color})` : 'var(--bew-text-2)' }" fw-bold>{{ a.author?.name }}</span>
                </div>
                <span>{{ timeAgo(a.time) }}</span>
              </div>
            </div>
            <!-- 右侧三个数 -->
            <div flex="~ items-center gap-3" shrink-0 text="xs $bew-text-3">
              <span flex="~ items-center gap-1"><span style="display:contents" v-html="renderIcon('mingcute:thumb-up-line', 14)" />{{ a.upvote ?? 0 }}</span>
              <span flex="~ items-center gap-1"><span style="display:contents" v-html="renderIcon('mingcute:comment-line', 14)" />{{ a.replyCount ?? 0 }}</span>
              <span flex="~ items-center gap-1"><span style="display:contents" v-html="renderIcon('mingcute:star-line', 14)" />{{ a.favorCount ?? 0 }}</span>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 空态 -->
      <div
        v-if="!loading && !errorMsg && articles.length === 0" class="empty-state-fade" bg="$bew-content" rounded="$bew-radius" p-8
        border="1 $bew-border-color" text="center $bew-text-3"
      >
        <span style="display:contents" v-html="renderIcon('mingcute:inbox-line', 32)" />
        <p mt-2>
          暂无文章
        </p>
      </div>

      <Loading v-if="loadingMore" />
      <div v-if="!loading && articles.length > 0 && currentPage < totalPages" ref="sentinelRef" style="height:60px;display:flex;align-items:center;justify-content:center" text="sm $bew-text-3">
        向下滚动加载更多...
      </div>
      <div v-if="!loading && articles.length > 0 && currentPage >= totalPages" text="sm $bew-text-3" text-center pb-8>
        已加载全部 {{ totalCount }} 篇文章
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
// 统一的互动 chip:图标 + 文字内联,所有按钮同款
.gulu-art-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  background: var(--bew-fill-1);
  color: var(--bew-text-2);
  font-size: 0.9em;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--bew-dur-fast),
    color var(--bew-dur-fast),
    border-color var(--bew-dur-fast),
    transform var(--bew-dur-fast);
  &:hover:not(:disabled) {
    background: var(--bew-fill-2);
    color: var(--bew-text-1);
  }
  &:active:not(:disabled) {
    transform: scale(0.96);
  }
  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
}
.gulu-art-chip-ico {
  display: inline-flex;
  align-items: center;
  line-height: 0; // 让 svg 垂直居中,不撑高行
}
.gulu-art-chip--static {
  cursor: default;
  &:hover {
    background: var(--bew-fill-1);
    color: var(--bew-text-2);
  }
}
// 已赞 / 已收藏:主题色实心
.gulu-art-chip--active {
  background: var(--bew-theme-color);
  border-color: var(--bew-theme-color);
  color: #fff;
  &:hover:not(:disabled) {
    background: var(--bew-theme-color);
    color: #fff;
    filter: brightness(1.08);
  }
}
// 已踩:警告色实心
.gulu-art-chip--active-warn {
  background: var(--bew-error-color);
  border-color: var(--bew-error-color);
  color: #fff;
  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }
}

.markdown-body {
  :deep(h1) {
    font-size: 1.4em;
    font-weight: 700;
    margin: 1em 0 0.5em;
    color: var(--bew-text-1);
  }
  :deep(h2) {
    font-size: 1.25em;
    font-weight: 700;
    margin: 1em 0 0.5em;
    color: var(--bew-text-1);
  }
  :deep(h3) {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0.8em 0 0.4em;
    color: var(--bew-text-1);
  }
  :deep(p) {
    margin: 0.5em 0;
  }
  :deep(a) {
    color: var(--bew-theme-color);
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
  :deep(code) {
    font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", monospace;
    background: var(--bew-fill-2);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
  }
  :deep(pre) {
    background: var(--code-bg);
    padding: 12px 16px;
    border-radius: var(--bew-radius);
    overflow-x: auto;
    border: 1px solid var(--bew-border-color);
    scrollbar-width: thin;
    scrollbar-color: var(--bew-fill-3) transparent;
    &::-webkit-scrollbar { height: 6px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: var(--bew-fill-3); border-radius: 999px; }
    &::-webkit-scrollbar-thumb:hover { background: var(--bew-fill-4); }
    :deep(code) {
      background: none;
      padding: 0;
      color: var(--code-text);
    }
  }
  :deep(.hljs) {
    color: var(--code-text);
    background: none;
  }
  :deep(.hljs-keyword) {
    color: var(--code-keyword);
  }
  :deep(.hljs-string),
  :deep(.hljs-addition) {
    color: var(--code-string);
  }
  :deep(.hljs-number),
  :deep(.hljs-literal),
  :deep(.hljs-attr) {
    color: var(--code-number);
  }
  :deep(.hljs-comment) {
    color: var(--code-comment);
    font-style: italic;
  }
  :deep(.hljs-function),
  :deep(.hljs-title) {
    color: var(--code-func);
  }
  :deep(.hljs-type),
  :deep(.hljs-built_in) {
    color: var(--code-type);
  }
  :deep(.hljs-meta),
  :deep(.hljs-variable),
  :deep(.hljs-name),
  :deep(.hljs-selector-class),
  :deep(.hljs-selector-tag) {
    color: var(--code-meta);
  }
  :deep(.hljs-params),
  :deep(.hljs-tag) {
    color: var(--code-text);
  }
  :deep(.hljs-deletion) {
    color: var(--code-meta);
  }
  :deep(blockquote) {
    border-left: 3px solid var(--bew-theme-color);
    padding: 4px 12px;
    margin: 0.5em 0;
    color: var(--bew-text-2);
    background: var(--bew-fill-1);
    border-radius: 0 var(--bew-radius) var(--bew-radius) 0;
  }
  :deep(ul),
  :deep(ol) {
    padding-left: 1.5em;
    margin: 0.5em 0;
  }
  :deep(li) {
    margin: 0.2em 0;
  }
  :deep(img) {
    max-width: 100%;
    border-radius: var(--bew-radius);
  }
  :deep(hr) {
    border: none;
    border-top: 1px solid var(--bew-border-color);
    margin: 1em 0;
  }
  :deep(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5em 0;
  }
  :deep(th),
  :deep(td) {
    border: 1px solid var(--bew-border-color);
    padding: 6px 12px;
    text-align: left;
  }
  :deep(th) {
    background: var(--bew-fill-1);
    font-weight: 600;
  }
  :deep(strong) {
    font-weight: 700;
    color: var(--bew-text-1);
  }
  :deep(del) {
    color: var(--bew-text-4);
  }
}

textarea:focus {
  box-shadow: 0 0 0 2px var(--bew-theme-color-20);
  outline: none;
}
</style>
