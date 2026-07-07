<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'
import { parseMarkdownContent } from '~/utils/markdown'
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'

const { currentUrl, navigateTo } = useGulyApp()

interface Post {
  id: number; title: string; time: number; topped: boolean; locked: boolean
  replyCount: number; forum: { name: string; color: string; slug: string }
  author: { uid: number; avatar: string; name: string; color: string; badge: string | null }
}

const posts = ref<Post[]>([])
const loading = ref(true); const loadingMore = ref(false); const errorMsg = ref('')
const currentPage = ref(1); const totalCount = ref(0); const pageSize = 30
const sentinelRef = ref<HTMLDivElement>()
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))

async function fetchPosts(append = false) {
  if (append) loadingMore.value = true; else loading.value = true
  errorMsg.value = ''
  try {
    const data = await browser.runtime.sendMessage({ contentScriptQuery: 'BLOG.getList', page: currentPage.value })
    if (data?.error) { errorMsg.value = data.error }
    else if (data?.data?.posts) {
      const r = data.data.posts
      posts.value = append ? [...posts.value, ...(r.result || [])] : (r.result || [])
      totalCount.value = r.count || 0
    } else { errorMsg.value = '数据格式不匹配' }
  } catch (e: any) { errorMsg.value = e.message }
  finally { loading.value = false; loadingMore.value = false }
}

function loadMore() {
  if (loadingMore.value || currentPage.value >= totalPages.value) return
  currentPage.value++; fetchPosts(true)
}
const discussId = computed(() => { const m = currentUrl.value.match(/\/discuss\/(\d+)/i) || currentUrl.value.match(/\/blog\/(\d+)/i); return m ? Number(m[1]) : null })
const detail = ref<any>(null)
const detailLoading = ref(false)

async function fetchDetail(id: number) {
  detailLoading.value = true
  try {
    // _contentOnly=1 doesn't work for discuss — fetch full page & parse lentille-context
    const res = await fetch(`https://www.luogu.com.cn/discuss/${id}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      // Structure: ctx.currentData.post (or .data.post)
      const raw = ctx?.currentData?.post || ctx?.data?.post || null
      if (raw && typeof raw === 'object') {
        detail.value = {
          ...raw,
          content: raw.content || raw.body || raw.text || '',
          author: raw.author || raw.user || raw.poster || {},
        }
      } else {
        detail.value = null
      }
    } else {
      detail.value = null
    }
  } catch (e: any) {
    console.error('[GuluGulu] fetchDetail error:', e)
  }
  detailLoading.value = false
}

function openPost(id: number) { navigateTo(AppPage.Blog, `https://www.luogu.com.cn/discuss/${id}`) }
function goToDiscussList() { navigateTo(AppPage.Blog, 'https://www.luogu.com.cn/discuss') }
onMounted(() => { discussId.value ? fetchDetail(discussId.value) : fetchPosts() })

let obs: IntersectionObserver | null = null
onMounted(() => {
  obs = new IntersectionObserver((e) => { if (e[0]?.isIntersecting && !loading.value && !loadingMore.value) loadMore() }, { rootMargin: '400px' })
  nextTick(() => { if (obs && sentinelRef.value) obs.observe(sentinelRef.value) })
})
watch(sentinelRef, (el) => { obs?.disconnect(); if (el) obs?.observe(el as Element) })
onUnmounted(() => obs?.disconnect())
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <!-- Detail View -->
    <template v-if="discussId">
      <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
        <button @click="goToDiscussList" style="background:none;border:none;cursor:pointer;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)" mb-2>← 返回讨论列表</button>
        <h1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">{{ detail?.title || '加载中...' }}</h1>
        <div v-if="detail" flex="~ items-center gap-3" mt-2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-3)">
          <img :src="detail.author?.avatar" style="width:24px;height:24px;border-radius:50%;object-fit:cover" @error="(e:any)=>{e.target.style.display='none'}">
          <span :style="{color:detail.author?.color?`var(--bew-${detail.author.color})`:'var(--bew-text-1)'}">{{ detail.author?.name }}</span>
          <span>{{ new Date((detail.time||0)*1000).toLocaleString('zh-CN') }}</span>
        </div>
      </div>
      <Loading v-if="detailLoading" />
      <Transition name="content-reveal">
        <div v-if="!detailLoading && detail" bg="$bew-content" rounded="$bew-radius" p-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <div class="markdown-body" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);line-height:1.8" v-html="parseMarkdownContent(detail.content || detail.body || '*(无内容)*')" />
        </div>
      </Transition>
    </template>

    <!-- List View -->
    <template v-else>
    <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
      <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:700" mb-2>讨论</h1>
      <p text="$bew-text-2">共 {{ totalCount }} 篇帖子</p>
    </div>

    <Loading v-if="loading" />
    <div v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" text="center $bew-text-2">
      <span v-html="renderIcon('mingcute:warning-line',32)" style="display:contents"/><p mt-2>{{ errorMsg }}</p>
    </div>

    <Transition name="content-reveal">
      <div v-if="!loading && posts.length>0" bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden">
        <div v-for="(post, idx) in posts" :key="post.id" class="stagger-row hover:bg-$bew-fill-2" :style="{ '--row-index': idx }" p="x-6 y-4" flex="~ col gap-2" cursor="pointer" border="b-1 $bew-border-color" duration-200 @click="openPost(post.id)">
          <div flex="~ items-center gap-2">
            <span v-if="post.topped" text="xs white" px-1.5 py-0.5 rounded-full bg="var(--bew-error-color)" fw-bold shrink-0>置顶</span>
            <span v-if="post.locked" text="xs $bew-text-3" px-1.5 py-0.5 rounded-full bg="$bew-fill-2" shrink-0>已锁定</span>
            <span text="xs" px-1.5 py-0.5 rounded-full shrink-0 :style="{background:post.forum.color?`var(--bew-${post.forum.color})`:'var(--bew-fill-2)',color:'white'}" fw-bold>{{ post.forum.name }}</span>
            <h3 text="base $bew-text-1" fw-bold overflow-hidden style="text-overflow:ellipsis;white-space:nowrap">{{ post.title }}</h3>
          </div>
          <div flex="~ items-center gap-3" text="xs $bew-text-3">
            <div flex="~ items-center gap-1">
              <img :src="post.author.avatar" style="width:18px;height:18px;border-radius:50%;object-fit:cover" @error="(e) => {(e.target as HTMLImageElement).style.display='none'}">
              <span :style="{color:post.author.color?`var(--bew-${post.author.color})`:'var(--bew-text-2)'}" fw-bold>{{ post.author.name }}</span>
            </div>
            <span>{{ timeAgo(post.time) }}</span>
            <span flex="~ items-center gap-1"><span v-html="renderIcon('mingcute:comment-line',14)" style="display:contents"/>{{ post.replyCount }}</span>
          </div>
        </div>
      </div>
    </Transition>

    <Loading v-if="loadingMore" />
    <div v-if="!loading && posts.length>0 && currentPage<totalPages" ref="sentinelRef" style="height:60px;display:flex;align-items:center;justify-content:center" text="sm $bew-text-3">向下滚动加载更多...</div>
    <div v-if="!loading && posts.length>0 && currentPage>=totalPages" text="sm $bew-text-3" text-center pb-8>已加载全部 {{ totalCount }} 篇帖子</div>
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
