<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'

const { navigateTo } = useGulyApp()

interface Post {
  id: number; title: string; time: number; topped: boolean; locked: boolean
  replyCount: number; forum: { name: string; color: string }
  author: { uid: number; avatar: string; name: string; color: string }
}

const posts = ref<Post[]>([])
const loading = ref(true)

async function fetchPosts() {
  loading.value = true
  try {
    const res = await fetch('https://www.luogu.com.cn/discuss', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const list: any[] = ctx?.data?.posts?.result || []
      posts.value = list.slice(0, 12).map((p: any) => ({
        id: p.id, title: p.title || '', time: p.time || 0,
        topped: p.topped || false, locked: p.locked || false, replyCount: p.replyCount || 0,
        forum: p.forum || { name: '', color: '' },
        author: p.author || { uid: 0, avatar: '', name: '', color: '' },
      }))
    }
  } catch {}
  loading.value = false
}
function openPost(id: number) { navigateTo(AppPage.Blog, `https://www.luogu.com.cn/discuss/${id}`) }

onMounted(fetchPosts)
</script>

<template>
  <div>
    <div style="backdrop-filter:var(--bew-filter-glass-1)" bg="$bew-content" rounded="12px" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 solid $bew-border-color" p="16px" mb="16px">
      <div mb-4>
        <h2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">最近讨论</h2>
        <p style="font-size:.85em;color:var(--bew-text-3)" mt-1>洛谷社区最新帖子</p>
      </div>
      <Loading v-if="loading" />
      <Transition name="content-reveal">
        <div v-if="!loading" flex="~ col" gap-2>
        <div v-for="(p, idx) in posts" :key="p.id" class="stagger-row d-row" :style="{'--row-index': idx}" flex="~ items-center gap-3" p-2 rounded="8px" cursor-pointer duration-200 @click="openPost(p.id)">
          <img :src="p.author.avatar" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0" @error="(e:any) => e.target.style.display='none'" />
          <div flex="1" min-w-0>
            <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              <span v-if="p.topped" style="color:var(--bew-error-color);font-weight:700">[置顶] </span>{{ p.title }}
            </div>
            <div flex="~ items-center gap-2" style="font-size:.75em;color:var(--bew-text-3)">
              <span :style="{ color: p.author.color ? `var(--bew-${p.author.color})` : 'var(--bew-text-2)', fontWeight: 600 }">{{ p.author.name }}</span>
              <span>{{ timeAgo(p.time) }}</span>
              <span flex="~ items-center gap-1"><span v-html="renderIcon('mingcute:comment-line',12)" style="display:contents"/>{{ p.replyCount }}</span>
            </div>
          </div>
          <span style="font-size:.7em;color:var(--bew-text-3)" px-1.5 py-0.5 rounded-full bg="$bew-fill-2" flex-shrink-0>{{ p.forum.name }}</span>
        </div>
        <div v-if="posts.length === 0" style="text-align:center;color:var(--bew-text-3);font-size:var(--bew-base-font-size)" py-8>暂无讨论</div>
      </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped lang="scss">
.d-row:hover { background: var(--bew-fill-2); }
</style>
