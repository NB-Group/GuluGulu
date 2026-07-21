<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'
import { diffLabel, diffColor } from '~/utils/difficulty'
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'

const { navigateTo } = useGulyApp()

interface Item {
  id: string; type: 'contest' | 'discuss'
  title: string; time: number; detail: string; url: string
}
interface UpcomingContest {
  id: number; name: string; startTime: number; endTime: number; rated: boolean
}
interface NewestProblem {
  pid: string; title: string; difficulty: number
}

const items = ref<Item[]>([])
const loading = ref(true)
const upcoming = ref<UpcomingContest[]>([])
const newest = ref<NewestProblem[]>([])
const newestLoading = ref(true)
const now = ref(Math.floor(Date.now() / 1000))
useIntervalFn(() => { now.value = Math.floor(Date.now() / 1000) }, 1000)

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
      const nowSec = Math.floor(Date.now() / 1000)
      for (const c of contests.slice(0, 5)) {
        const isEnded = c.endTime && nowSec >= c.endTime
        list.push({ id: `c-${c.id}`, type: 'contest', title: c.name || c.title || '', time: c.startTime || 0, detail: (c.rated && c.rated > 0 ? 'Rated' : '') + (isEnded ? ' 已结束' : ''), url: `https://www.luogu.com.cn/contest/${c.id}` })
      }
      upcoming.value = contests
        .filter((c: any) => c.endTime && nowSec < c.endTime)
        .sort((a: any, b: any) => (a.startTime || 0) - (b.startTime || 0))
        .slice(0, 4)
        .map((c: any) => ({ id: c.id, name: c.name || c.title || '', startTime: c.startTime || 0, endTime: c.endTime || 0, rated: !!(c.rated && c.rated > 0) }))
    }
  } catch (e) { console.warn('[GuluGulu]', e) }
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
  } catch (e) { console.warn('[GuluGulu]', e) }

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
function openItem(url: string) {
  if (!url) return
  if (url.includes('/discuss/'))
    navigateTo(AppPage.Blog, url)
  else
    window.open(url, '_blank')
}

async function fetchNewest() {
  newestLoading.value = true
  try {
    // /problem/list?_contentOnly=1 对列表页返回的是 HTML(非 JSON),要 fetch 页面 + 正则抽 lentille-context
    const res = await fetch('https://www.luogu.com.cn/problem/list', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    const ctx = m?.[1] ? JSON.parse(m[1]) : null
    const list: any[] = ctx?.data?.problems?.result || ctx?.currentData?.problems?.result || []
    newest.value = list.slice(0, 9).map((p: any) => ({
      pid: p.pid || '', title: p.name || p.title || '', difficulty: p.difficulty || 0,
    }))
  } catch (e) { console.warn('[GuluGulu]', e) }
  newestLoading.value = false
}

function pad(n: number) { return String(n).padStart(2, '0') }
function fmtCountdown(target: number): string {
  const diff = target - now.value
  if (diff <= 0) return '00:00:00'
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  return d > 0 ? `${d} 天 ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`
}
function contestCountdown(c: UpcomingContest): string {
  return now.value < c.startTime ? `距开始 ${fmtCountdown(c.startTime)}` : `距结束 ${fmtCountdown(c.endTime)}`
}
function countdownStyle(c: UpcomingContest): Record<string, string> {
  return now.value < c.startTime
    ? { color: 'var(--bew-theme-color)', background: 'var(--bew-theme-color-20)' }
    : { color: '#52c41a', background: 'rgba(82,196,26,0.15)' }
}
function openProblem(pid: string) { navigateTo(AppPage.ProblemDetail, `https://www.luogu.com.cn/problem/${pid}`) }

onMounted(() => {
  fetchData()
  fetchNewest()
})
</script>

<template>
  <div>
    <div style="backdrop-filter:var(--bew-filter-glass-1)" bg="$bew-content" rounded="12px" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 solid $bew-border-color" p="16px" mb="16px">
      <div mb-4 flex="~ items-center gap-2">
        <span v-html="renderIcon('mingcute:rss-line', 20)" style="display:contents;color:var(--bew-theme-color)" />
        <div>
          <h2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">动态</h2>
          <p style="font-size:.85em;color:var(--bew-text-3)" mt-1>最新比赛和讨论</p>
        </div>
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

    <!-- 比赛倒计时 -->
    <div style="backdrop-filter:var(--bew-filter-glass-1)" bg="$bew-content" rounded="12px" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 solid $bew-border-color" p="16px" mb="16px">
      <div mb-4 flex="~ items-center gap-2">
        <span v-html="renderIcon('mingcute:timer-2-line', 20)" style="display:contents;color:var(--bew-theme-color)" />
        <div>
          <h2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">比赛倒计时</h2>
          <p style="font-size:.85em;color:var(--bew-text-3)" mt-1>即将开始 / 进行中</p>
        </div>
      </div>
      <Transition name="content-reveal">
        <div v-if="upcoming.length" flex="~ col" gap-2>
          <div v-for="(c, idx) in upcoming" :key="c.id" class="stagger-row trend-row" :style="{'--row-index': idx}" flex="~ items-center justify-between gap-3 wrap" p-3 rounded="8px" cursor-pointer duration-200 @click="openItem(`https://www.luogu.com.cn/contest/${c.id}`)">
            <div flex="1" min-w-0>
              <div flex="~ items-center gap-2" mb-1>
                <span v-if="c.rated" style="font-size:.7em;font-weight:600;padding:1px 6px;border-radius:9999px;background:var(--bew-warning-color-20);color:var(--bew-warning-color)">Rated</span>
              </div>
              <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.name }}</div>
            </div>
            <span font-mono fw-700 px-3 py-1.5 rounded="8px" style="font-size:.8em;white-space:nowrap" :style="countdownStyle(c)">{{ contestCountdown(c) }}</span>
          </div>
        </div>
        <div v-else style="text-align:center;color:var(--bew-text-3);font-size:var(--bew-base-font-size)" py-8>暂无即将开始的比赛</div>
      </Transition>
    </div>

    <!-- 最新题目 -->
    <div style="backdrop-filter:var(--bew-filter-glass-1)" bg="$bew-content" rounded="12px" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 solid $bew-border-color" p="16px" mb="16px">
      <div mb-4 flex="~ items-center gap-2">
        <span v-html="renderIcon('mingcute:sparkles-2-line', 20)" style="display:contents;color:var(--bew-theme-color)" />
        <div>
          <h2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">最新题目</h2>
          <p style="font-size:.85em;color:var(--bew-text-3)" mt-1>题库最新收录</p>
        </div>
      </div>
      <Loading v-if="newestLoading" />
      <Transition name="content-reveal">
        <div v-if="!newestLoading" grid="~ cols-1 md:cols-2 lg:cols-3" gap-3>
          <div v-for="(p, idx) in newest" :key="p.pid" class="stagger-row problem-card" :style="{'--row-index': idx}" bg="$bew-fill-1" rounded="8px" p-3 cursor-pointer border="1 solid $bew-border-color" duration-200 @click="openProblem(p.pid)">
            <div flex="~ items-center justify-between" mb-1>
              <span style="font-size:.8em;color:var(--bew-text-3)" font-mono>{{ p.pid }}</span>
              <span style="font-size:.7em;padding:1px 6px;border-radius:9999px;font-weight:600" :style="{ color: diffColor(p.difficulty), background: diffColor(p.difficulty) + '20' }">{{ diffLabel(p.difficulty) }}</span>
            </div>
            <div style="font-size:.9em;color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ p.title }}</div>
          </div>
          <div v-if="newest.length === 0" style="grid-column:1/-1;text-align:center;color:var(--bew-text-3);font-size:var(--bew-base-font-size)" py-8>获取题目失败</div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped lang="scss">
.trend-row:hover { background: var(--bew-fill-2); }
.problem-card { transition: box-shadow 200ms ease, transform 200ms ease; }
.problem-card:hover { box-shadow: var(--bew-shadow-2); transform: translateY(-2px); }
</style>
