<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { getCsrfToken } from '~/utils/luogu-api'
import { ccfLabel, ccfColor } from '~/utils/difficulty'

const uid = computed(() => {
  const m = document.URL.match(/\/user\/(\d+)/)
  return m ? Number(m[1]) : null
})

interface UserData {
  uid: number; name: string; avatar: string; color: string; ccfLevel: number
  slogan: string; background: string; badge: string | null
  followingCount: number; followerCount: number; ranking: number
  passedProblemCount: number; submittedProblemCount: number
  registerTime: number; introduction: string; userRelationship: number
  eloValue: number | null
}

const user = ref<UserData | null>(null)
const currentViewer = ref<any>(null)
const prizes = ref<any[]>([])
const gu = ref<any>(null)
const dailyCounts = ref<Record<string, [number, number]>>({})
const loading = ref(true)
const errorMsg = ref('')

const relationshipLabel = computed(() => {
  const r = user.value?.userRelationship || 0
  if (r === 2 || r === 3) return '互相关注'
  if (r === 1) return '已关注'
  return null
})

function colorVar(c: string): string {
  const m: Record<string, string> = { Red: '#e74c3c', Green: '#52c41a', Blue: '#3498db', Orange: '#f39c12', Purple: '#9b59b6', Gray: '#95a5a6' }
  return m[c] || '#52c41a'
}

async function fetchUser() {
  if (!uid.value) { errorMsg.value = '无效的用户ID'; loading.value = false; return }
  loading.value = true; errorMsg.value = ''
  try {
    const res = await fetch(`https://www.luogu.com.cn/user/${uid.value}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const u = ctx?.data?.user
      if (u) {
        user.value = {
          uid: u.uid, name: u.name, avatar: u.avatar, color: u.color,
          ccfLevel: u.ccfLevel || 0, slogan: u.slogan || '', background: u.background || '',
          badge: u.badge, followingCount: u.followingCount || 0,
          followerCount: u.followerCount || 0, ranking: u.ranking || 0,
          passedProblemCount: u.passedProblemCount || 0,
          submittedProblemCount: u.submittedProblemCount || 0,
          registerTime: u.registerTime || 0,
          introduction: u.introduction || '',
          userRelationship: u.userRelationship || 0,
          eloValue: u.eloValue,
        }
      }
      currentViewer.value = ctx?.user || null
      prizes.value = ctx?.data?.prizes || []
      gu.value = ctx?.data?.gu || null
      dailyCounts.value = ctx?.data?.dailyCounts || {}
    }
  } catch (e: any) { errorMsg.value = e.message }
  loading.value = false
}

function openUser(uid: number) { window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank') }
function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('zh-CN')
}

// ============================================================
// Heatmap (GitHub-style contribution graph)
// ============================================================
interface HeatCell {
  date: string; count: number; level: number; dayOfWeek: number
  weekIndex: number; dayIndex: number
}
const heatmapCells = computed<HeatCell[]>(() => {
  const now = new Date()
  const cells: HeatCell[] = []
  // Go back 365 days
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const entry = dailyCounts.value[key]
    cells.push({
      date: key,
      count: entry?.[0] || 0,
      level: entry?.[1] || 0,
      dayOfWeek: d.getDay(),
      weekIndex: Math.floor((364 - i) / 7),
      dayIndex: d.getDay(),
    })
  }
  return cells
})
const heatmapWeeks = computed(() => {
  // Group cells by week
  const weeks: HeatCell[][] = []
  for (let i = 0; i < heatmapCells.value.length; i += 7) {
    weeks.push(heatmapCells.value.slice(i, i + 7))
  }
  return weeks
})
const heatmapMonths = computed(() => {
  const months: { label: string; startWeek: number }[] = []
  const seen = new Set<string>()
  for (let w = 0; w < heatmapWeeks.value.length; w++) {
    const week = heatmapWeeks.value[w]
    const mid = week[Math.floor(week.length / 2)]
    if (!mid) continue
    const label = `${Number(mid.date.slice(5, 7))}月`
    if (!seen.has(label) || w === heatmapWeeks.value.length - 1) {
      months.push({ label, startWeek: w })
      seen.add(label)
    }
  }
  return months
})
function cellColor(level: number): string {
  if (level <= 0) return 'var(--bew-fill-2)'
  const colors = [
    'var(--bew-fill-2)',
    'var(--bew-theme-color-20)',
    'var(--bew-theme-color-40)',
    'var(--bew-theme-color-60)',
    'var(--bew-theme-color)',
  ]
  return colors[Math.min(level, 4)] || colors[4]
}
function cellTooltip(cell: HeatCell): string {
  if (cell.count === 0) return `${cell.date} — 无提交`
  return `${cell.date} — ${cell.count} 题`
}

onMounted(fetchUser)
watch(uid, () => { if (uid.value) fetchUser() })
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <Loading v-if="loading" />
    <div v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" text="center $bew-text-2" style="backdrop-filter:var(--bew-filter-glass-1)">
      <span v-html="renderIcon('mingcute:warning-line', 32)" style="display:contents" /><p mt-2>{{ errorMsg }}</p>
    </div>

    <Transition name="content-reveal">
      <div v-if="!loading && user" w-full>
        <!-- Profile Card -->
        <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <div flex="~ col md:row gap-6" items="start md:items-center">
            <!-- Avatar -->
            <div flex="~ col" items="center" gap-2 shrink-0>
              <div w="80px" h="80px" rounded-full overflow-hidden bg="$bew-fill-2" border="3 solid" :style="{ borderColor: `${colorVar(user.color)}40` }">
                <img :src="user.avatar" style="width:100%;height:100%;object-fit:cover" @error="(e:any) => e.target.style.display='none'" />
              </div>
              <span text="xs" fw-bold px-2 py-0.5 rounded-full :style="{ background: `${ccfColor(user.ccfLevel)}20`, color: ccfColor(user.ccfLevel) }">
                {{ ccfLabel(user.ccfLevel) }}
              </span>
              <span v-if="relationshipLabel" text="xs" px-2 py-0.5 rounded-full bg="$bew-theme-color-20" style="color:var(--bew-theme-color);font-weight:600">{{ relationshipLabel }}</span>
            </div>

            <!-- Info -->
            <div flex="~ col 1" gap-2>
              <div flex="~ items-center gap-3">
                <h1 style="font-size:1.5rem;font-weight:700" :style="{ color: colorVar(user.color) }">{{ user.name }}</h1>
                <span text="xs $bew-text-2" px-2 py-0.5 rounded-full bg="$bew-fill-1">UID: {{ user.uid }}</span>
              </div>
              <p v-if="user.slogan" style="font-size:var(--bew-base-font-size);color:var(--bew-text-2)">{{ user.slogan }}</p>
              <div flex="~ gap-1 wrap" style="font-size:var(--bew-base-font-size);color:var(--bew-text-3)">
                <span>关注 <strong style="color:var(--bew-text-1)">{{ user.followingCount }}</strong></span>
                <span mx-1>|</span>
                <span>粉丝 <strong style="color:var(--bew-text-1)">{{ user.followerCount }}</strong></span>
                <span mx-1>|</span>
                <span>排名 <strong style="color:var(--bew-text-1)">#{{ user.ranking.toLocaleString() }}</strong></span>
                <span mx-1>|</span>
                <span>注册于 {{ formatDate(user.registerTime) }}</span>
              </div>
              <!-- GU Score -->
              <div v-if="gu" flex="~ gap-3" style="font-size:var(--bew-base-font-size)">
                <span>Rating: <strong style="color:var(--bew-warning-color)">{{ gu.rating || 0 }}</strong></span>
                <span>练习: <strong style="color:var(--bew-success-color)">{{ gu.scores?.practice || 0 }}</strong></span>
                <span>比赛: <strong style="color:var(--bew-theme-color)">{{ gu.scores?.contest || 0 }}</strong></span>
                <span>社交: <strong style="color:var(--bew-text-3)">{{ gu.scores?.social || 0 }}</strong></span>
              </div>
            </div>

          </div>

          <!-- Introduction -->
          <div v-if="user.introduction" mt-4 p-4 rounded="$bew-radius" bg="$bew-fill-1" style="font-size:var(--bew-base-font-size);color:var(--bew-text-2);line-height:1.7;white-space:pre-wrap">
            {{ user.introduction.replace(/^>\s*/gm, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/~~/g, '') }}
          </div>
        </div>

        <!-- Stats -->
        <div grid="~ cols-2 md:cols-4" gap-4 mb-6>
          <div v-for="stat in [
            { label: '通过', value: user.passedProblemCount, icon: 'check-circle-line', color: '#52c41a' },
            { label: '提交', value: user.submittedProblemCount, icon: 'code-line', color: '#1890ff' },
            { label: '粉丝', value: user.followerCount, icon: 'user-4-line', color: '#722ed1' },
            { label: '关注', value: user.followingCount, icon: 'user-follow-line', color: '#faad14' },
          ]" :key="stat.label"
            bg="$bew-content" rounded="$bew-radius" p-4 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)"
            flex="~ items-center gap-3"
          >
            <span v-html="renderIcon('mingcute:'+stat.icon, 24)" :style="{ color: stat.color, display:'contents' }" />
            <div>
              <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-3)">{{ stat.label }}</div>
              <div style="font-size:1.2rem;font-weight:700;color:var(--bew-text-1)">{{ (stat.value || 0).toLocaleString() }}</div>
            </div>
          </div>
        </div>

        <!-- Heatmap -->
        <div v-if="Object.keys(dailyCounts).length > 0" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)" overflow="auto">
          <h2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700" mb-3>练习记录</h2>
          <div class="heatmap" style="min-width:fit-content">
            <!-- Month labels -->
            <div flex="~" style="margin-left:28px;font-size:10px;color:var(--bew-text-4)" mb-1>
              <span v-for="m in heatmapMonths" :key="m.startWeek" :style="{ marginLeft: m.startWeek === 0 ? '0' : '0', width: (m.startWeek === heatmapMonths[0]?.startWeek ? 'auto' : 'auto'), flex: '1' }" v-text="m.label" />
            </div>
            <div flex="~">
              <!-- Day labels -->
              <div flex="~ col" style="gap:3px;margin-right:6px;font-size:10px;color:var(--bew-text-4)" py-2>
                <span v-for="day in ['一','','三','','五','','日']" :key="day" style="height:12px;line-height:12px">{{ day }}</span>
              </div>
              <!-- Heatmap grid -->
              <div flex="~" style="gap:3px">
                <div v-for="(week, wi) in heatmapWeeks" :key="wi" flex="~ col" style="gap:3px">
                  <div
                    v-for="(cell, di) in week" :key="di"
                    class="heat-cell"
                    style="width:12px;height:12px;border-radius:2px"
                    :style="{ background: cellColor(cell.level) }"
                  >
                    <span class="heat-tooltip">{{ cellTooltip(cell) }}</span>
                  </div>
                </div>
              </div>
            </div>
            <!-- Legend -->
            <div flex="~ items-center justify-end gap-1" mt-2 style="font-size:10px;color:var(--bew-text-4)">
              <span>少</span>
              <span v-for="lv in [0,1,2,3,4]" :key="lv" style="width:12px;height:12px;border-radius:2px" :style="{ background: cellColor(lv) }" />
              <span>多</span>
            </div>
          </div>
        </div>

        <!-- Prizes -->
        <div v-if="prizes.length > 0" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <h2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700" mb-3>获奖记录</h2>
          <div flex="~ wrap" gap-2>
            <span v-for="(p, i) in prizes" :key="i" text="sm $bew-text-1" px-3 py-1 rounded-full bg="$bew-fill-1">
              {{ p.prize?.year }} {{ p.prize?.contest }} {{ p.prize?.prize }}
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.heat-cell {
  position: relative;
  cursor: pointer;
  &:hover .heat-tooltip {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
.heat-tooltip {
  opacity: 0;
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  background: var(--bew-text-1);
  color: var(--bew-content);
  font-size: 11px;
  white-space: nowrap;
  padding: 3px 8px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 10;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
</style>
