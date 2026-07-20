<script setup lang="ts">
import { useGulyApp } from '~/composables/useAppProvider'
import { OVERLAY_SCROLL_BAR_SCROLL } from '~/constants/globalEvents'
import { AppPage } from '~/enums/appEnums'
import { ccfColor, ccfLabel, diffColor, diffLabel } from '~/utils/difficulty'
import { renderIcon } from '~/utils/icons'
import { parseMarkdownContent } from '~/utils/markdown'
import emitter from '~/utils/mitt'

const { navigateTo, scrollbarRef } = useGulyApp()

// Embedded sub-views reused as tab content (GitHub-style inline tabs)
const PracticeView = defineAsyncComponent(() => import('../Practice/Practice.vue'))
const ProblemsView = defineAsyncComponent(() => import('../MyProblems/MyProblems.vue'))
const ContestsView = defineAsyncComponent(() => import('../MyContests/MyContests.vue'))
const FavoritesView = defineAsyncComponent(() => import('../TrainingFav/TrainingFav.vue'))
const TeamsView = defineAsyncComponent(() => import('../Team/Team.vue'))
const NotificationView = defineAsyncComponent(() => import('../Notification/Notification.vue'))

const uid = computed(() => {
  const m = document.URL.match(/\/user\/(\d+)/)
  return m ? Number(m[1]) : null
})
const subView = computed(() => {
  if (/\/user\/\d+\/following/i.test(document.URL))
    return 'following'
  if (/\/user\/\d+\/follower/i.test(document.URL))
    return 'followers'
  return null
})

interface UserData {
  uid: number
  name: string
  avatar: string
  color: string
  ccfLevel: number
  slogan: string
  background: string
  badge: string | null
  followingCount: number
  followerCount: number
  ranking: number
  passedProblemCount: number
  submittedProblemCount: number
  registerTime: number
  introduction: string
  userRelationship: number
  eloValue: number | null
}

type ProfileTab
  = 'overview'
    | 'practice'
    | 'following'
    | 'followers'
    | 'problems'
    | 'contests'
    | 'favorites'
    | 'teams'
    | 'notifications'

const user = ref<UserData | null>(null)
const prizes = ref<any[]>([])
const gu = ref<any>(null)
const dailyCounts = ref<Record<string, [number, number]>>({})
const loading = ref(true)
const errorMsg = ref('')
const followList = ref<any[]>([])
const followLoading = ref(false)
const followLoaded = ref<Set<'following' | 'followers'>>(new Set())

// Sticky-header collapse on scroll (GitHub-style): shrink avatar, hide
// UID/slogan and move the tab bar inline to the right when scrolled down.
const collapsed = ref(false)
let collapseRaf = 0
let lastToggle = 0
function refreshCollapsed() {
  collapseRaf = 0
  // Collapse reflows the document, shifting scrollTop under the sticky header
  // and re-firing this handler. Ignore events for a beat after a toggle so the
  // layout-settling scroll bursts don't feed back into another toggle.
  if (performance.now() - lastToggle < 450)
    return
  const viewport = scrollbarRef.value?.osInstance?.()?.elements?.()?.viewport
  const scrollTop = viewport?.scrollTop || 0
  if (collapsed.value && scrollTop <= 14) {
    collapsed.value = false
    lastToggle = performance.now()
  }
  else if (!collapsed.value && scrollTop > 40) {
    collapsed.value = true
    lastToggle = performance.now()
  }
}
function onViewportScroll() {
  if (collapseRaf)
    return
  collapseRaf = requestAnimationFrame(refreshCollapsed)
}

const isOwnProfile = computed(() => {
  const myUid = (window as any).__guly_user?.uid
  return myUid && String(uid.value) === String(myUid)
})

const activeTab = ref<ProfileTab>('overview')

const tabs = computed(() => {
  const list: { key: ProfileTab, label: string, icon: string, count?: number }[] = [
    { key: 'overview', label: '概览', icon: 'mingcute:user-3-line' },
    { key: 'practice', label: '练习', icon: 'mingcute:chart-bar-line', count: user.value?.passedProblemCount },
    { key: 'following', label: '关注', icon: 'mingcute:user-follow-line', count: user.value?.followingCount },
    { key: 'followers', label: '粉丝', icon: 'mingcute:user-4-line', count: user.value?.followerCount },
  ]
  if (isOwnProfile.value) {
    list.push(
      { key: 'problems', label: '题库', icon: 'mingcute:code-line' },
      { key: 'contests', label: '比赛', icon: 'mingcute:trophy-line' },
      { key: 'favorites', label: '收藏', icon: 'mingcute:bookmark-line' },
      { key: 'teams', label: '团队', icon: 'mingcute:group-line' },
      { key: 'notifications', label: '通知', icon: 'mingcute:notification-line' },
    )
  }
  return list
})

function selectTab(key: ProfileTab) {
  activeTab.value = key
  if ((key === 'following' || key === 'followers') && !followLoaded.value.has(key))
    fetchFollowList(key)
}

const relationshipLabel = computed(() => {
  const r = user.value?.userRelationship || 0
  if (r === 2 || r === 3)
    return '互相关注'
  if (r === 1)
    return '已关注'
  return null
})

const stats = computed(() => [
  { label: '通过', value: user.value?.passedProblemCount, icon: 'mingcute:check-circle-line', color: '#52c41a' },
  { label: '提交', value: user.value?.submittedProblemCount, icon: 'mingcute:code-line', color: '#1890ff' },
  { label: '粉丝', value: user.value?.followerCount, icon: 'mingcute:user-4-line', color: '#722ed1', tab: 'followers' as ProfileTab },
  { label: '关注', value: user.value?.followingCount, icon: 'mingcute:user-follow-line', color: '#faad14', tab: 'following' as ProfileTab },
])

const guScores = computed(() => {
  const s = gu.value?.scores || {}
  return [
    { label: '信用', value: s.basic || 0, color: 'var(--bew-success-color)' },
    { label: '练习', value: s.practice || 0, color: 'var(--bew-success-color)' },
    { label: '比赛', value: s.contest || 0, color: 'var(--bew-theme-color)' },
    { label: '贡献', value: s.social || 0, color: 'var(--bew-text-3)' },
    { label: '成就', value: s.prize || 0, color: 'var(--bew-text-3)' },
  ]
})

function colorVar(c: string): string {
  const m: Record<string, string> = {
    Red: '#e74c3c',
    Green: '#52c41a',
    Blue: '#3498db',
    Orange: '#f39c12',
    Purple: '#9b59b6',
    Gray: '#95a5a6',
  }
  return m[c] || '#52c41a'
}

async function fetchUser() {
  if (!uid.value) {
    errorMsg.value = '无效的用户ID'
    loading.value = false
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await fetch(`https://www.luogu.com.cn/user/${uid.value}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const u = ctx?.data?.user
      if (u) {
        user.value = {
          uid: u.uid,
          name: u.name,
          avatar: u.avatar,
          color: u.color,
          ccfLevel: u.ccfLevel || 0,
          slogan: u.slogan || '',
          background: u.background || '',
          badge: u.badge,
          followingCount: u.followingCount || 0,
          followerCount: u.followerCount || 0,
          ranking: u.ranking || 0,
          passedProblemCount: u.passedProblemCount || 0,
          submittedProblemCount: u.submittedProblemCount || 0,
          registerTime: u.registerTime || 0,
          introduction: u.introduction || '',
          userRelationship: u.userRelationship || 0,
          eloValue: u.eloValue,
        }
      }
      prizes.value = ctx?.data?.prizes || []
      gu.value = ctx?.data?.gu || null
      dailyCounts.value = ctx?.data?.dailyCounts || {}
    }
  }
  catch (e: any) {
    errorMsg.value = e.message
  }
  loading.value = false
}

async function fetchFollowList(type: 'following' | 'followers') {
  followLoading.value = true
  try {
    const urlType = type === 'followers' ? 'follower' : 'following'
    const res = await fetch(`https://www.luogu.com.cn/user/${uid.value}/${urlType}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const users = ctx?.data?.users?.result || ctx?.currentData?.users?.result || []
      followList.value = users
      followLoaded.value.add(type)
    }
  }
  catch {}
  followLoading.value = false
}

function openFollowUser(uid2: number) {
  navigateTo(AppPage.UserProfile, `https://www.luogu.com.cn/user/${uid2}`)
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('zh-CN')
}

// ============================================================
// Heatmap (GitHub-style contribution graph)
// ============================================================
interface HeatCell {
  date: string
  count: number
  level: number
  dayOfWeek: number
  weekIndex: number
  dayIndex: number
}
const heatmapCells = computed<HeatCell[]>(() => {
  const now = new Date()
  const cells: HeatCell[] = []
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
  const weeks: HeatCell[][] = []
  for (let i = 0; i < heatmapCells.value.length; i += 7)
    weeks.push(heatmapCells.value.slice(i, i + 7))
  return weeks
})
const heatmapMonths = computed(() => {
  const months: { label: string, startWeek: number }[] = []
  const seen = new Set<string>()
  for (let w = 0; w < heatmapWeeks.value.length; w++) {
    const week = heatmapWeeks.value[w]
    const mid = week[Math.floor(week.length / 2)]
    if (!mid)
      continue
    const label = `${Number(mid.date.slice(5, 7))}月`
    if (!seen.has(label) || w === heatmapWeeks.value.length - 1) {
      months.push({ label, startWeek: w })
      seen.add(label)
    }
  }
  return months
})

const heatmapHalves = computed(() => {
  const months = heatmapMonths.value
  const weeks = heatmapWeeks.value
  const cells = heatmapCells.value
  if (!weeks.length)
    return []
  // split at the month boundary nearest the middle so no month is cut across two rows
  const midWeek = weeks.length / 2
  let splitWeek = Math.ceil(midWeek)
  let best = Infinity
  for (const m of months) {
    if (m.startWeek <= 0)
      continue
    const d = Math.abs(m.startWeek - midWeek)
    if (d < best) {
      best = d
      splitWeek = m.startWeek
    }
  }
  const build = (wStart: number, wEnd: number) => ({
    weekCount: wEnd - wStart,
    months: months
      .filter(m => m.startWeek >= wStart && m.startWeek < wEnd)
      .map(m => ({ label: m.label, startWeek: m.startWeek - wStart })),
    cells: cells
      .filter(c => c.weekIndex >= wStart && c.weekIndex < wEnd)
      .map(c => ({ ...c, weekIndex: c.weekIndex - wStart })),
  })
  return [build(0, splitWeek), build(splitWeek, weeks.length)]
})
const totalYearCount = computed(() => heatmapCells.value.reduce((s, c) => s + (c.count || 0), 0))

function cellColor(level: number, count: number): string {
  if (count <= 0)
    return 'var(--bew-fill-2)'
  // alpha floor ~0.67 so even 1-problem days read clearly; scales to full at 6+
  const a = Math.round((0.67 + (Math.min(count, 6) / 6) * 0.33) * 255)
  return `${diffColor(level)}${a.toString(16).padStart(2, '0').toUpperCase()}`
}
function cellTooltip(cell: HeatCell): string {
  if (cell.count === 0)
    return `${cell.date} — 无提交`
  return `${cell.date} — ${cell.count} 题`
}

onMounted(() => {
  emitter.on(OVERLAY_SCROLL_BAR_SCROLL, onViewportScroll)
  fetchUser()
  if (subView.value) {
    activeTab.value = subView.value
    fetchFollowList(subView.value)
  }
})
onUnmounted(() => {
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL, onViewportScroll)
  if (collapseRaf)
    cancelAnimationFrame(collapseRaf)
})
watch(uid, () => {
  if (uid.value) {
    activeTab.value = 'overview'
    followList.value = []
    followLoaded.value = new Set()
    fetchUser()
  }
})
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <Loading v-if="loading && !user" />
    <div
      v-if="!loading && errorMsg && !user"
      bg="$bew-content"
      rounded="$bew-radius"
      p-8
      border="1 $bew-border-color"
      text="center $bew-text-2"
      style="backdrop-filter: var(--bew-filter-glass-1)"
    >
      <span style="display: contents" v-html="renderIcon('mingcute:warning-line', 32)" />
      <p mt-2>
        {{ errorMsg }}
      </p>
    </div>

    <Transition name="content-reveal">
      <div v-if="user" w-full>
        <!-- ============================================================ -->
        <!-- Sticky profile header: identity + GitHub-style tab bar -->
        <!-- ============================================================ -->
        <header class="profile-header" :class="{ 'is-collapsed': collapsed }">
          <div class="profile-header-row">
            <div
              class="header-avatar"
              :style="{ borderColor: `${colorVar(user.color)}40` }"
            >
              <img
                :src="user.avatar"
                style="width: 100%; height: 100%; object-fit: cover"
                @error="(e: any) => (e.target.style.display = 'none')"
              >
            </div>
            <div flex="1" min-w-0>
              <div flex="~ items-center gap-2 wrap">
                <h1 class="header-name" style="font-weight: 700; line-height: 1.2" :style="{ color: colorVar(user.color) }">
                  {{ user.name }}
                </h1>
                <span
                  class="header-collapse" text="xs $bew-text-2" px-2 py-0.5 rounded-full
                  bg="$bew-fill-1"
                >UID: {{ user.uid }}</span>
                <span
                  text="xs"
                  fw-bold
                  px-2
                  py-0.5
                  rounded-full
                  :style="{ background: `${ccfColor(user.ccfLevel)}20`, color: ccfColor(user.ccfLevel) }"
                >
                  {{ ccfLabel(user.ccfLevel) }}
                </span>
                <span
                  v-if="relationshipLabel"
                  text="xs"
                  px-2
                  py-0.5
                  rounded-full
                  bg="$bew-theme-color-20"
                  style="color: var(--bew-theme-color); font-weight: 600"
                >{{ relationshipLabel }}</span>
              </div>
              <p
                v-if="user.slogan"
                class="header-collapse-block"
                mt-1
                style="font-size: 0.9em; color: var(--bew-text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
              >
                {{ user.slogan }}
              </p>
            </div>
          </div>

          <!-- Tab bar -->
          <nav class="profile-tabs">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="profile-tab"
              :class="{ 'profile-tab--active': activeTab === tab.key }"
              @click="selectTab(tab.key)"
            >
              <span style="display: contents" v-html="renderIcon(tab.icon, 16)" />
              <span>{{ tab.label }}</span>
              <span v-if="tab.count !== undefined" class="count">{{ (tab.count || 0).toLocaleString() }}</span>
            </button>
          </nav>
        </header>

        <!-- ============================================================ -->
        <!-- Body: left identity sidebar + right tab content -->
        <!-- ============================================================ -->
        <div flex="~ col md:row gap-4">
          <!-- Sidebar -->
          <aside class="profile-sidebar">
            <div
              bg="$bew-content"
              rounded="$bew-radius"
              p-6
              shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
              border="1 $bew-border-color"
              style="backdrop-filter: var(--bew-filter-glass-1)"
            >
              <!-- Big avatar -->
              <div flex="~ col" items-center gap-3 mb-4>
                <div
                  w="120px"
                  h="120px"
                  rounded-full
                  overflow-hidden
                  bg="$bew-fill-2"
                  border="3 solid"
                  :style="{ borderColor: `${colorVar(user.color)}40` }"
                >
                  <img
                    :src="user.avatar"
                    style="width: 100%; height: 100%; object-fit: cover"
                    @error="(e: any) => (e.target.style.display = 'none')"
                  >
                </div>
              </div>

              <!-- Stats grid -->
              <div grid="~ cols-2 gap-2" mb-4>
                <div
                  v-for="stat in stats"
                  :key="stat.label"
                  class="stat-tile"
                  :class="{ 'stat-tile--clickable': !!stat.tab, 'stat-tile--active': stat.tab && activeTab === stat.tab }"
                  flex="~ items-center gap-2"
                  p-3
                  rounded="$bew-radius"
                  bg="$bew-fill-1"
                  @click="stat.tab && selectTab(stat.tab)"
                >
                  <span :style="{ color: stat.color, display: 'contents' }" v-html="renderIcon(stat.icon, 18)" />
                  <div>
                    <div style="font-size: 0.7em; color: var(--bew-text-3)">
                      {{ stat.label }}
                    </div>
                    <div style="font-size: 1rem; font-weight: 700; color: var(--bew-text-1)">
                      {{ (stat.value || 0).toLocaleString() }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Meta info -->
              <div class="sidebar-meta">
                <div flex="~ items-center justify-between">
                  <span style="color: var(--bew-text-3)">排名</span>
                  <strong style="color: var(--bew-text-1)">#{{ user.ranking.toLocaleString() }}</strong>
                </div>
                <div flex="~ items-center justify-between">
                  <span style="color: var(--bew-text-3)">注册于</span>
                  <strong style="color: var(--bew-text-1)">{{ formatDate(user.registerTime) }}</strong>
                </div>
              </div>

              <!-- GU score -->
              <div v-if="gu" mt-4 pt-4 border="t-1 $bew-border-color">
                <div flex="~ items-center justify-between" mb-2>
                  <span style="font-weight: 700; color: var(--bew-text-1)">总咕值</span>
                  <strong style="color: var(--bew-warning-color); font-size: 1.1rem">{{ gu.rating || 0 }}</strong>
                </div>
                <div grid="~ cols-2 gap-2">
                  <div
                    v-for="g in guScores"
                    :key="g.label"
                    flex="~ items-center justify-between"
                    px-2 py-1 rounded="$bew-radius"
                    bg="$bew-fill-1"
                    style="font-size: 0.8em"
                  >
                    <span style="color: var(--bew-text-3)">{{ g.label }}</span>
                    <strong :style="{ color: g.color }">{{ g.value }}</strong>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <!-- Tab content -->
          <div flex="1" min-w-0>
            <Transition name="content-reveal" mode="out-in">
              <!-- Overview -->
              <div v-if="activeTab === 'overview'" key="overview">
                <!-- Introduction -->
                <div
                  v-if="user.introduction"
                  bg="$bew-content"
                  rounded="$bew-radius"
                  p-6
                  mb-4
                  shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
                  border="1 $bew-border-color"
                  style="backdrop-filter: var(--bew-filter-glass-1)"
                  class="profile-intro"
                  v-html="parseMarkdownContent(user.introduction)"
                />

                <!-- Heatmap -->
                <div
                  v-if="Object.keys(dailyCounts).length > 0"
                  bg="$bew-content"
                  rounded="$bew-radius"
                  p-6
                  mb-4
                  shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
                  border="1 $bew-border-color"
                  style="backdrop-filter: var(--bew-filter-glass-1)"
                >
                  <div flex="~ items-center justify-between wrap" mb-3 gap-2>
                    <div>
                      <h2 style="font-size: var(--bew-base-font-size); color: var(--bew-text-1); font-weight: 700">
                        练习记录
                      </h2>
                      <p text="xs $bew-text-3" mt-0.5>
                        过去一年共 {{ totalYearCount }} 题
                      </p>
                    </div>
                    <!-- difficulty palette legend (explains the rainbow) -->
                    <div flex="~ items-center gap-1" text="xs $bew-text-3">
                      <span>难度</span>
                      <span
                        v-for="lv in [1, 2, 3, 4, 5, 6, 7]"
                        :key="lv"
                        :title="diffLabel(lv)"
                        style="width: 10px; height: 10px; border-radius: 2px"
                        :style="{ background: diffColor(lv) }"
                      />
                    </div>
                  </div>
                  <!-- CSS grid: months/days/cells all placed by week index so
                       columns align (months were flex-evenly-spaced before). -->
                  <div class="heatmap-wrap">
                    <div
                      v-for="(half, hi) in heatmapHalves"
                      :key="hi"
                      class="heatmap-grid"
                      :style="{ gridTemplateColumns: `22px repeat(${half.weekCount}, minmax(0, 1fr))` }"
                    >
                      <span
                        v-for="m in half.months"
                        :key="`${m.label}-${m.startWeek}`"
                        class="hm-month"
                        :style="{ gridColumn: `${m.startWeek + 2} / span 1`, gridRow: '1' }"
                        v-text="m.label"
                      />
                      <span class="hm-day" style="grid-row: 2; grid-column: 1">一</span>
                      <span class="hm-day" style="grid-row: 4; grid-column: 1">三</span>
                      <span class="hm-day" style="grid-row: 6; grid-column: 1">五</span>
                      <span class="hm-day" style="grid-row: 8; grid-column: 1">日</span>
                      <span
                        v-for="cell in half.cells"
                        :key="cell.date"
                        class="hm-cell"
                        :style="{ gridColumn: cell.weekIndex + 2, gridRow: ((cell.dayIndex + 6) % 7) + 2, background: cellColor(cell.level, cell.count) }"
                      >
                        <span class="hm-tooltip">{{ cellTooltip(cell) }}</span>
                      </span>
                    </div>
                  </div>
                  <!-- activity intensity legend (theme color, separate from difficulty hue) -->
                  <div flex="~ items-center justify-end gap-1" mt-2 style="font-size: 10px; color: var(--bew-text-4)">
                    <span>少</span>
                    <span
                      v-for="a in [0.6, 0.75, 0.88, 1]"
                      :key="a"
                      style="width: 12px; height: 12px; border-radius: 3px"
                      :style="{ background: 'var(--bew-theme-color)', opacity: a }"
                    />
                    <span>多</span>
                  </div>
                </div>

                <!-- Prizes -->
                <div
                  v-if="prizes.length > 0"
                  bg="$bew-content"
                  rounded="$bew-radius"
                  p-6
                  shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
                  border="1 $bew-border-color"
                  style="backdrop-filter: var(--bew-filter-glass-1)"
                >
                  <h2 style="font-size: var(--bew-base-font-size); color: var(--bew-text-1); font-weight: 700" mb-3>
                    获奖记录
                  </h2>
                  <div flex="~ wrap" gap-2>
                    <span
                      v-for="(p, i) in prizes" :key="i" text="sm $bew-text-1" px-3 py-1
                      rounded-full bg="$bew-fill-1"
                    >
                      {{ p.prize?.year }} {{ p.prize?.contest }} {{ p.prize?.prize }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Following / Followers -->
              <div v-else-if="activeTab === 'following' || activeTab === 'followers'" :key="activeTab">
                <Loading v-if="followLoading" />
                <Transition name="content-reveal">
                  <div
                    v-if="!followLoading && followList.length > 0"
                    bg="$bew-content"
                    rounded="$bew-radius"
                    shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
                    border="1 $bew-border-color"
                    style="backdrop-filter: var(--bew-filter-glass-1)"
                    overflow="hidden"
                  >
                    <div
                      v-for="(fu, idx) in followList"
                      :key="fu.uid"
                      class="stagger-row hover:bg-$bew-fill-2"
                      :style="{ '--row-index': idx }"
                      flex="~ items-center gap-4"
                      p="x-6 y-3.5"
                      border="b-1 $bew-border-color"
                      cursor="pointer"
                      duration-200
                      @click="openFollowUser(fu.uid)"
                    >
                      <img
                        :src="fu.avatar"
                        style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0"
                        @error="(e: any) => { e.target.style.display = 'none' }"
                      >
                      <div flex="~ items-center gap-2" flex-1 min-w-0>
                        <span
                          :style="{
                            color: fu.color ? `var(--bew-${fu.color})` : 'var(--bew-text-1)',
                            fontWeight: 600,
                            fontSize: 'var(--bew-base-font-size)',
                          }"
                        >{{ fu.name }}</span>
                        <span
                          v-if="fu.badge"
                          text="xs"
                          px-1.5
                          py-0.5
                          rounded-full
                          bg="$bew-fill-2"
                          style="color: var(--bew-text-3)"
                        >{{ fu.badge }}</span>
                      </div>
                      <div flex="~ gap-3" shrink-0 style="font-size: 0.85em; color: var(--bew-text-3)">
                        <span>{{ fu.followerCount || 0 }} 粉丝</span>
                        <span>{{ fu.passedProblemCount || 0 }} 题通过</span>
                      </div>
                    </div>
                  </div>
                </Transition>
                <div
                  v-if="!followLoading && followList.length === 0"
                  bg="$bew-content"
                  rounded="$bew-radius"
                  p-8
                  border="1 $bew-border-color"
                  text="center $bew-text-3"
                  style="backdrop-filter: var(--bew-filter-glass-1)"
                >
                  <span style="display: contents" v-html="renderIcon('mingcute:user-4-line', 48)" />
                  <p mt-2>
                    暂无{{ activeTab === 'following' ? '关注' : '粉丝' }}
                  </p>
                </div>
              </div>

              <!-- Practice (any user) -->
              <PracticeView v-else-if="activeTab === 'practice'" key="practice" embedded :uid="uid" />

              <!-- Own-profile tabs -->
              <ProblemsView v-else-if="activeTab === 'problems'" key="problems" embedded />
              <ContestsView v-else-if="activeTab === 'contests'" key="contests" embedded />
              <FavoritesView v-else-if="activeTab === 'favorites'" key="favorites" embedded />
              <TeamsView v-else-if="activeTab === 'teams'" key="teams" embedded />
              <NotificationView v-else-if="activeTab === 'notifications'" key="notifications" embedded />
            </Transition>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.profile-header {
  position: sticky;
  top: calc(var(--bew-top-bar-height) + 10px);
  z-index: 9;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 14px;
  background: var(--bew-content);
  backdrop-filter: var(--bew-filter-glass-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  box-shadow: var(--bew-shadow-1), var(--bew-shadow-edge-glow-1);
  padding: 16px 20px;
  margin-bottom: 16px;
  transition: padding 0.32s ease;
}
.profile-header.is-collapsed {
  padding: 8px 16px;
}

.profile-header-row {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bew-fill-2);
  border: 3px solid transparent;
  flex-shrink: 0;
  transition: width 0.32s ease, height 0.32s ease, border-width 0.32s ease;
}
.profile-header.is-collapsed .header-avatar {
  width: 40px;
  height: 40px;
  border-width: 2px;
}

.header-name {
  font-size: 1.3rem;
  transition: font-size 0.32s ease;
}
.profile-header.is-collapsed .header-name {
  font-size: 1.1rem;
}

/* UID chip — collapses width + fades out */
.header-collapse {
  display: inline-block;
  max-width: 220px;
  overflow: hidden;
  white-space: nowrap;
  vertical-align: middle;
  opacity: 1;
  transition: opacity 0.24s ease, max-width 0.32s ease, margin 0.32s ease;
}
.profile-header.is-collapsed .header-collapse {
  max-width: 0;
  margin: 0;
  opacity: 0;
}

/* Slogan — collapses height + fades out */
.header-collapse-block {
  max-height: 28px;
  overflow: hidden;
  opacity: 1;
  transition: opacity 0.24s ease, max-height 0.32s ease, margin-top 0.32s ease;
}
.profile-header.is-collapsed .header-collapse-block {
  max-height: 0;
  margin-top: 0;
  opacity: 0;
}

/* GitHub-style underline tab bar */
.profile-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 100%;
  margin-top: 14px;
  border-bottom: 1px solid var(--bew-border-color);
  overflow-x: auto;
  scrollbar-width: none;
  transition: flex-basis 0.32s ease, flex-grow 0.32s ease, margin-top 0.32s ease, border-color 0.32s ease;
}
/* Collapsed: tab bar slides up to sit inline, right-aligned with the avatar */
.profile-header.is-collapsed .profile-tabs {
  flex: 1 1 0%;
  min-width: 0;
  margin-top: 0;
  justify-content: flex-end;
  border-bottom-color: transparent;
}
.profile-tabs::-webkit-scrollbar {
  display: none;
}
.profile-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  white-space: nowrap;
  color: var(--bew-text-2);
  font-size: var(--bew-base-font-size);
  font-weight: 600;
  transition:
    color 0.2s,
    border-color 0.2s;
}
.profile-tab:hover {
  color: var(--bew-text-1);
}
.profile-tab--active {
  color: var(--bew-theme-color);
  border-bottom-color: var(--bew-theme-color);
  font-weight: 700;
}
.profile-tab .count {
  font-size: 0.8em;
  font-weight: 600;
  color: var(--bew-text-3);
  background: var(--bew-fill-2);
  padding: 0 7px;
  border-radius: 999px;
}
.profile-tab--active .count {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-20);
}

.profile-sidebar {
  width: 100%;
  flex-shrink: 0;
}
@media (min-width: 768px) {
  .profile-sidebar {
    width: 300px;
  }
}

.sidebar-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.9em;
}

.stat-tile {
  transition: background 0.2s;
}
.stat-tile--clickable {
  cursor: pointer;
}
.stat-tile--clickable:hover {
  background: var(--bew-fill-2) !important;
}
.stat-tile--active {
  background: var(--bew-theme-color-20) !important;
  outline: 1px solid var(--bew-theme-color-40);
}

.heatmap-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}
.heatmap-grid {
  display: grid;
  gap: 2px;
  width: 100%;
}
.hm-month {
  font-size: 10px;
  color: var(--bew-text-4);
  white-space: nowrap;
}
.hm-day {
  font-size: 10px;
  color: var(--bew-text-4);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 4px;
}
.hm-cell {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 3px;
  position: relative;
  cursor: pointer;
  &:hover .hm-tooltip {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
.hm-tooltip {
  opacity: 0;
  position: absolute;
  bottom: calc(100% + 5px);
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
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.profile-intro {
  font-size: var(--bew-base-font-size);
  color: var(--bew-text-2);
  line-height: 1.7;
  :deep(h1),
  :deep(h2),
  :deep(h3) {
    font-weight: 700;
    color: var(--bew-text-1);
    margin: 0.5em 0 0.3em;
  }
  :deep(p) {
    margin: 0.3em 0;
  }
  :deep(a) {
    color: var(--bew-theme-color);
  }
  :deep(ul),
  :deep(ol) {
    padding-left: 1.5em;
  }
  :deep(code) {
    background: var(--bew-fill-2);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.9em;
  }
  :deep(blockquote) {
    border-left: 3px solid var(--bew-theme-color);
    padding: 2px 10px;
    margin: 0.4em 0;
    color: var(--bew-text-3);
  }
  :deep(img) {
    max-width: 100%;
    border-radius: var(--bew-radius);
  }
}
</style>
