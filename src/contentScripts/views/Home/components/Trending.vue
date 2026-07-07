<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'

interface Item {
  id: string; type: 'contest' | 'discuss'
  title: string; time: number; detail: string; url: string
}

const items = ref<Item[]>([])
const loading = ref(true)

async function fetchData() {
  loading.value = true
  const list: Item[] = []
  try {
    // Contests — frontend fetch
    const cr = await fetch('https://www.luogu.com.cn/contest/list', { credentials: 'same-origin' })
    const ch = await cr.text()
    const cm = ch.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
    if (cm?.[1]) {
      const ctx = JSON.parse(cm[1])
      const contests: any[] = ctx?.data?.contests?.result || []
      for (const c of contests.slice(0, 5)) {
        list.push({ id: `c-${c.id}`, type: 'contest', title: c.name || c.title || '', time: c.startTime || 0, detail: (c.rated === 1 || c.rated === true) ? 'Rated' : '', url: `https://www.luogu.com.cn/contest/${c.id}` })
      }
    }
  } catch {}
  try {
    // Discussions — frontend fetch
    const dr = await fetch('https://www.luogu.com.cn/discuss', { credentials: 'same-origin' })
    const dh = await dr.text()
    const dm = dh.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
    if (dm?.[1]) {
      const ctx = JSON.parse(dm[1])
      const posts: any[] = ctx?.data?.posts?.result || []
      for (const p of posts.slice(0, 8)) {
        if (!p.topped) {
          list.push({ id: `d-${p.id}`, type: 'discuss', title: p.title || '', time: p.time || 0, detail: `${p.replyCount || 0} 回复`, url: `https://www.luogu.com.cn/discuss/${p.id}` })
        }
      }
    }
  } catch {}

  list.sort((a, b) => b.time - a.time)
  items.value = list.slice(0, 20)
  loading.value = false
}

function typeIcon(t: string): string {
  return { contest: 'mingcute:trophy-line', discuss: 'mingcute:comment-line' }[t] || 'mingcute:time-line'
}
function typeColor(t: string): string {
  return { contest: '#1890ff', discuss: '#722ed1' }[t] || 'var(--bew-text-3)'
}
function openItem(url: string) { if (url) window.open(url, url.includes('/discuss/') ? '_self' : '_blank') }

onMounted(fetchData)
</script>

<template>
  <div>
    <div style="backdrop-filter:var(--bew-filter-glass-1)" bg="$bew-content" rounded="12px" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 solid $bew-border-color" p="16px" mb="16px">
      <div mb-4>
        <h2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">动态</h2>
        <p style="font-size:.85em;color:var(--bew-text-3)" mt-1>最新比赛和讨论</p>
      </div>
      <Loading v-if="loading" />
      <Transition name="content-reveal">
        <div v-if="!loading" flex="~ col" gap-2>
        <div v-for="(act, idx) in items" :key="act.id" class="stagger-row trend-row" :style="{'--row-index': idx}" flex="~ items-center gap-3" p-2 rounded="8px" cursor-pointer duration-200 @click="openItem(act.url)">
          <span v-html="renderIcon(typeIcon(act.type), 18)" :style="{ color: typeColor(act.type), display:'contents', flexShrink:0 }" />
          <div flex="1" min-w-0>
            <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ act.title }}</div>
            <div flex="~ items-center gap-2" style="font-size:.75em;color:var(--bew-text-3)">
              <span>{{ timeAgo(act.time) }}</span>
              <span v-if="act.detail">{{ act.detail }}</span>
            </div>
          </div>
        </div>
        <div v-if="items.length === 0" style="text-align:center;color:var(--bew-text-3);font-size:var(--bew-base-font-size)" py-8>暂无动态</div>
      </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped lang="scss">
.trend-row:hover { background: var(--bew-fill-2); }
</style>
