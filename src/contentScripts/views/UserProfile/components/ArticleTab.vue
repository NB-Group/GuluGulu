<script setup lang="ts">
import { useGuluApp } from '~/composables/useAppProvider'
import { AppPage } from '~/enums/appEnums'
import { renderIcon } from '~/utils/icons'
import { friendlyError } from '~/utils/luogu-api'
import { timeAgo } from '~/utils/main'
import { parseMarkdownContent } from '~/utils/markdown'

const props = defineProps<{ mode: 'author' | 'fav', uid?: number }>()
const { navigateTo } = useGuluApp()

const catLabels: Record<number, string> = { 1: '算法', 2: '游记', 3: '题解', 4: '杂谈', 5: '科技', 6: '生活' }

interface ArticleItem {
  lid: string
  title: string
  category: number
  time: number
  author?: { uid: number, name: string, avatar: string, color?: string }
  upvote?: number
  replyCount?: number
  favorCount?: number
  content?: string
}

const items = ref<ArticleItem[]>([])
const loading = ref(true)
const errorMsg = ref('')

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    // author: 某人写的专栏(/user/{uid}/article);fav: 我收藏的专栏(/user/mine/articleFav)
    const url = props.mode === 'fav'
      ? location.origin + '/user/mine/articleFav'
      : `${location.origin}/user/${props.uid}/article`
    const res = await fetch(url, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const r = ctx?.data?.articles
      items.value = Array.isArray(r?.result) ? r.result : []
    }
    else { errorMsg.value = '请先登录洛谷' }
  }
  catch (e: any) { errorMsg.value = friendlyError(e) }
  loading.value = false
}

function open(lid: string) {
  navigateTo(AppPage.Article, `${location.origin}/article/${lid}`)
}

function plain(text?: string) {
  if (!text)
    return ''
  return parseMarkdownContent(text).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 90)
}

onMounted(load)
</script>

<template>
  <div>
    <Loading v-if="loading" />
    <div v-if="!loading && errorMsg" text="center $bew-text-3" py-8>
      {{ errorMsg }}
    </div>
    <div v-if="!loading && !errorMsg && items.length === 0" class="empty-state-fade" text="center $bew-text-3" py-10>
      <span style="display:contents" v-html="renderIcon('mingcute:inbox-line', 48)" />
      <p mt-2>
        {{ mode === 'fav' ? '暂无收藏的专栏' : '暂无专栏' }}
      </p>
    </div>
    <TransitionGroup v-if="!loading && items.length > 0" name="list" tag="div" flex="~ col gap-2">
      <div
        v-for="(a, idx) in items" :key="a.lid"
        class="stagger-row"
        :style="{ '--row-index': idx }"
        bg="$bew-fill-1" rounded="$bew-radius" p="x-4 y-3" cursor="pointer"
        hover:bg-$bew-fill-2 duration-200
        @click="open(a.lid)"
      >
        <div flex="~ items-center gap-2">
          <span
            text="xs white" px-1.5 py-0.5 rounded-full shrink-0
            :style="{ background: 'var(--bew-theme-color)' }" fw-bold
          >{{ catLabels[a.category] || '其他' }}</span>
          <span flex-1 min-w-0 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ a.title }}</span>
        </div>
        <div v-if="plain(a.content)" mt-1 style="font-size:.82em;color:var(--bew-text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          {{ plain(a.content) }}
        </div>
        <div flex="~ items-center gap-3" mt-2 style="font-size:.8em;color:var(--bew-text-3)">
          <span v-if="a.author?.name" :style="{ color: a.author.color ? `var(--bew-${a.author.color})` : 'var(--bew-text-3)' }">{{ a.author.name }}</span>
          <span>{{ timeAgo(a.time) }}</span>
          <span flex="~ items-center gap-1" ml-auto><span style="display:contents" v-html="renderIcon('mingcute:thumb-up-line', 13)" />{{ a.upvote ?? 0 }}</span>
          <span flex="~ items-center gap-1"><span style="display:contents" v-html="renderIcon('mingcute:comment-line', 13)" />{{ a.replyCount ?? 0 }}</span>
          <span flex="~ items-center gap-1"><span style="display:contents" v-html="renderIcon('mingcute:star-line', 13)" />{{ a.favorCount ?? 0 }}</span>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>
