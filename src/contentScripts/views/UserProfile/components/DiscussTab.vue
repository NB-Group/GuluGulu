<script setup lang="ts">
import { useGuluApp } from '~/composables/useAppProvider'
import { AppPage } from '~/enums/appEnums'
import { renderIcon } from '~/utils/icons'
import { friendlyError } from '~/utils/luogu-api'
import { timeAgo } from '~/utils/main'

const { navigateTo } = useGuluApp()

interface PostItem {
  id: number
  title: string
  time: number
  author?: { uid: number, name: string, avatar: string, color?: string }
  replyCount?: number
}

const items = ref<PostItem[]>([])
const loading = ref(true)
const errorMsg = ref('')

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await fetch('https://www.luogu.com.cn/user/mine/discuss', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const r = ctx?.data?.posts
      items.value = Array.isArray(r?.result) ? r.result : []
    }
    else { errorMsg.value = '请先登录洛谷' }
  }
  catch (e: any) { errorMsg.value = friendlyError(e) }
  loading.value = false
}

function open(id: number) {
  navigateTo(AppPage.Blog, `https://www.luogu.com.cn/discuss/${id}`)
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
        暂无讨论
      </p>
    </div>
    <TransitionGroup v-if="!loading && items.length > 0" name="list" tag="div" flex="~ col gap-2">
      <div
        v-for="(p, idx) in items" :key="p.id"
        class="stagger-row" :style="{ '--row-index': idx }"
        bg="$bew-fill-1" rounded="$bew-radius" p="x-4 y-3" cursor="pointer"
        hover:bg-$bew-fill-2 duration-200
        @click="open(p.id)"
      >
        <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          {{ p.title }}
        </div>
        <div flex="~ items-center gap-3" mt-1 style="font-size:.8em;color:var(--bew-text-3)">
          <span v-if="p.author?.name" :style="{ color: p.author.color ? `var(--bew-${p.author.color})` : 'var(--bew-text-3)' }">{{ p.author.name }}</span>
          <span>{{ timeAgo(p.time) }}</span>
          <span v-if="p.replyCount != null" flex="~ items-center gap-1" ml-auto><span style="display:contents" v-html="renderIcon('mingcute:comment-line', 13)" />{{ p.replyCount }}</span>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>
