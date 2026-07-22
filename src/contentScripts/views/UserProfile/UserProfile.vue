<script setup lang="ts">
import { useGulyApp } from '~/composables/useAppProvider'
import { AppPage } from '~/enums/appEnums'
import { ccfColor, ccfLabel, diffColor, diffLabel } from '~/utils/difficulty'
import { renderIcon } from '~/utils/icons'
import { getCsrfToken } from '~/utils/luogu-api'
import { parseMarkdownContent } from '~/utils/markdown'

const { navigateTo } = useGulyApp()

// Embedded sub-views reused as tab content (GitHub-style inline tabs)
const PracticeView = defineAsyncComponent(() => import('../Practice/Practice.vue'))
const ProblemsView = defineAsyncComponent(() => import('../MyProblems/MyProblems.vue'))
const ContestsView = defineAsyncComponent(() => import('../MyContests/MyContests.vue'))
const FavoritesView = defineAsyncComponent(() => import('../TrainingFav/TrainingFav.vue'))
const TeamsView = defineAsyncComponent(() => import('../Team/Team.vue'))
const ArticleAuthorTab = defineAsyncComponent(() => import('./components/ArticleTab.vue'))
const ArticleFavTab = defineAsyncComponent(() => import('./components/ArticleTab.vue'))
const DiscussTab = defineAsyncComponent(() => import('./components/DiscussTab.vue'))

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
    | 'articles'
    | 'discuss'

// 父 tab 内的小 tab(收藏:题单/专栏;比赛:参加/创建)
const favSub = ref<'training' | 'article'>('training')
const contestSub = ref<'joined' | 'created'>('joined')

const user = ref<UserData | null>(null)
const prizes = ref<any[]>([])
const gu = ref<any>(null)
const dailyCounts = ref<Record<string, [number, number]>>({})
const loading = ref(true)
const errorMsg = ref('')
const followList = ref<any[]>([])
const followLoading = ref(false)
const followLoaded = ref<Set<'following' | 'followers'>>(new Set())

const isOwnProfile = computed(() => {
  const myUid = (window as any).__guly_user?.uid
  return myUid && String(uid.value) === String(myUid)
})

// HD avatar: use the canonical CDN path from uid (the lentille `avatar` field is
// often a downscaled thumbnail; the uid-keyed path is the full-resolution source).
const hdAvatar = computed(() => user.value ? `https://cdn.luogu.com.cn/upload/usericon/${user.value.uid}.png` : '')

const activeTab = ref<ProfileTab>('overview')

const tabs = computed(() => {
  const list: { key: ProfileTab, label: string, count?: number }[] = [
    { key: 'overview', label: '概览' },
    { key: 'practice', label: '练习', count: user.value?.passedProblemCount },
    { key: 'followers', label: '粉丝', count: user.value?.followerCount },
    { key: 'following', label: '关注', count: user.value?.followingCount },
  ]
  if (isOwnProfile.value) {
    list.push(
      { key: 'problems', label: '题库' },
      { key: 'contests', label: '比赛' },
      { key: 'articles', label: '专栏' },
      { key: 'favorites', label: '收藏' },
      { key: 'discuss', label: '讨论' },
      { key: 'teams', label: '团队' },
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

// 关注/取消关注 (Luogu: POST /fe/api/user/follow/:uid — toggles)
const followSending = ref(false)
function followLabel(r?: number): string {
  const v = r ?? 0
  if (v === 2 || v === 3)
    return '互相关注'
  if (v === 1)
    return '已关注'
  return '关注'
}
async function toggleFollow() {
  if (!user.value || followSending.value)
    return
  followSending.value = true
  try {
    await fetch(`https://www.luogu.com.cn/fe/api/user/follow/${user.value.uid}`, {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': getCsrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
    })
    const r = user.value.userRelationship || 0
    const nowFollowing = !(r >= 1)
    user.value = {
      ...user.value,
      userRelationship: nowFollowing ? (r === 2 ? 3 : 1) : (r === 3 ? 2 : 0),
      followerCount: (user.value.followerCount || 0) + (nowFollowing ? 1 : -1),
    }
  }
  catch (e) { console.warn('[GuluGulu] follow failed:', e) }
  followSending.value = false
}

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

// 竞赛 rating(eloValue)分层着色,近似洛谷/CP 通行分段
function ratingColor(elo: number | null): string {
  if (elo == null)
    return 'var(--bew-text-3)'
  if (elo >= 2500)
    return '#8B0000'
  if (elo >= 2200)
    return '#e74c3c'
  if (elo >= 1900)
    return '#f39c12'
  if (elo >= 1600)
    return '#9b59b6'
  if (elo >= 1400)
    return '#3498db'
  if (elo >= 1200)
    return '#52c41a'
  return '#909399'
}

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
  fetchUser()
  if (subView.value) {
    activeTab.value = subView.value
    fetchFollowList(subView.value)
  }
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
      <div v-if="user" class="gh-layout">
        <!-- ============================================================ -->
        <!-- Left identity sidebar (card, sticky) -->
        <!-- ============================================================ -->
        <aside class="gh-sidebar-wrap">
          <div class="gh-card gh-sidebar-card">
            <!-- Avatar: circle, HD -->
            <div class="gh-avatar" :style="{ borderColor: `${colorVar(user.color)}40` }">
              <img
                :src="hdAvatar"
                style="width: 100%; height: 100%; object-fit: cover"
                @error="(e: any) => { e.target.onerror = null; e.target.src = user.avatar }"
              >
            </div>

            <!-- Name + username -->
            <h1 class="gh-name" :style="{ color: colorVar(user.color) }">
              {{ user.name }}
            </h1>
            <div class="gh-username">
              UID {{ user.uid }}
            </div>

            <!-- Badges row -->
            <div flex="~ items-center gap-1.5 wrap" mt-3>
              <span
                text="xs" fw-bold px-2 py-0.5 rounded-full
                :style="{ background: `${ccfColor(user.ccfLevel)}20`, color: ccfColor(user.ccfLevel) }"
              >{{ ccfLabel(user.ccfLevel) }}</span>
              <span
                v-if="user.eloValue != null"
                text="xs" fw-bold px-2 py-0.5 rounded-full
                :style="{ background: `${ratingColor(user.eloValue)}20`, color: ratingColor(user.eloValue) }"
              >Rating {{ user.eloValue }}</span>
              <span
                v-if="gu?.rating"
                text="xs" fw-bold px-2 py-0.5 rounded-full
                bg="$bew-fill-1"
                style="color: var(--bew-warning-color)"
              >咕值 {{ gu.rating }}</span>
              <span
                v-if="relationshipLabel"
                text="xs" px-2 py-0.5 rounded-full bg="$bew-theme-color-20"
                style="color: var(--bew-theme-color); font-weight: 600"
              >{{ relationshipLabel }}</span>
            </div>

            <!-- Bio / slogan -->
            <p v-if="user.slogan" class="gh-bio">
              {{ user.slogan }}
            </p>

            <!-- 自己:编辑资料; 他人:关注/取关 -->
            <button v-if="isOwnProfile" class="gh-follow-btn" @click="navigateTo(AppPage.UserSetting, 'https://www.luogu.com.cn/user/setting')">
              编辑资料
            </button>
            <button
              v-else
              class="gh-follow-btn"
              :class="{ 'gh-follow-btn--active': (user.userRelationship ?? 0) >= 1 }"
              :disabled="followSending"
              @click="toggleFollow"
            >
              {{ followSending ? '...' : followLabel(user.userRelationship) }}
            </button>

            <!-- 粉丝 · 关注 -->
            <div class="gh-follow-row">
              <span class="gh-link" @click="selectTab('followers')">
                <strong>{{ user.followerCount.toLocaleString() }}</strong> 粉丝
              </span>
              <span style="color: var(--bew-text-4)">·</span>
              <span class="gh-link" @click="selectTab('following')">
                <strong>{{ user.followingCount.toLocaleString() }}</strong> 关注
              </span>
            </div>

            <!-- Detail list -->
            <ul class="gh-detail-list">
              <li>
                <span style="display: contents" v-html="renderIcon('mingcute:trophy-line', 16)" />
                <span>排名</span>
                <strong>#{{ user.ranking.toLocaleString() }}</strong>
              </li>
              <li>
                <span style="display: contents" v-html="renderIcon('mingcute:check-circle-line', 16)" />
                <span>通过</span>
                <strong>{{ user.passedProblemCount.toLocaleString() }} 题</strong>
              </li>
              <li>
                <span style="display: contents" v-html="renderIcon('mingcute:code-line', 16)" />
                <span>提交</span>
                <strong>{{ user.submittedProblemCount.toLocaleString() }} 题</strong>
              </li>
              <li>
                <span style="display: contents" v-html="renderIcon('mingcute:calendar-line', 16)" />
                <span>注册于</span>
                <strong>{{ formatDate(user.registerTime) }}</strong>
              </li>
            </ul>

            <!-- GU score -->
            <div v-if="gu" class="gh-gu">
              <div flex="~ items-center justify-between" mb-2>
                <span style="font-weight: 700; color: var(--bew-text-1); font-size: .9em">咕值明细</span>
                <strong style="color: var(--bew-warning-color); font-size: 1rem">{{ gu.rating || 0 }}</strong>
              </div>
              <div grid="~ cols-1 gap-1.5">
                <div
                  v-for="g in guScores" :key="g.label"
                  flex="~ items-center justify-between" style="font-size: 0.82em"
                >
                  <span style="color: var(--bew-text-3)">{{ g.label }}</span>
                  <strong :style="{ color: g.color }">{{ g.value }}</strong>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <!-- ============================================================ -->
        <!-- Right main: card with tab bar + content -->
        <!-- ============================================================ -->
        <main class="gh-main">
          <div class="gh-card gh-main-card">
            <!-- Tab bar (fixed, doesn't scroll) -->
            <nav class="gh-tabs">
              <button
                v-for="tab in tabs" :key="tab.key"
                class="gh-tab" :class="{ 'gh-tab--active': activeTab === tab.key }"
                @click="selectTab(tab.key)"
              >
                <span>{{ tab.label }}</span>
                <span v-if="tab.count !== undefined" class="gh-tab-count">{{ (tab.count || 0).toLocaleString() }}</span>
              </button>
            </nav>

            <!-- Tab content scroll area -->
            <div class="gh-tab-scroll">
              <Transition name="content-reveal" mode="out-in">
                <!-- Overview -->
                <div v-if="activeTab === 'overview'" key="overview">
                  <!-- Introduction (pinned-readme style) -->
                  <div
                    v-if="user.introduction"
                    class="gh-section"
                    mb-4
                  >
                    <div class="gh-section-title">
                      <span style="display: contents" v-html="renderIcon('mingcute:book-line', 16)" />
                      <span>个人简介</span>
                    </div>
                    <div class="profile-intro" v-html="parseMarkdownContent(user.introduction)" />
                  </div>

                  <!-- Heatmap (contribution graph) -->
                  <div
                    v-if="Object.keys(dailyCounts).length > 0"
                    class="gh-section"
                    mb-4
                  >
                    <div flex="~ items-center justify-between wrap" mb-3 gap-2>
                      <div>
                        <h2 style="font-size: var(--bew-base-font-size); color: var(--bew-text-1); font-weight: 700">
                          过去一年共 {{ totalYearCount }} 次提交
                        </h2>
                      </div>
                      <!-- difficulty palette legend -->
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
                    class="gh-section"
                  >
                    <div class="gh-section-title">
                      <span style="display: contents" v-html="renderIcon('mingcute:trophy-line', 16)" />
                      <span>获奖记录</span>
                    </div>
                    <div flex="~ col gap-2">
                      <div
                        v-for="(p, i) in prizes" :key="i"
                        flex="~ items-center gap-2" p-2 rounded="$bew-radius" bg="$bew-fill-1"
                      >
                        <span style="display: contents" v-html="renderIcon('mingcute:medal-line', 18)" />
                        <span text="sm $bew-text-1">
                          {{ p.prize?.year }} {{ p.prize?.contest }} {{ p.prize?.prize }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Following / Followers -->
                <div v-else-if="activeTab === 'following' || activeTab === 'followers'" :key="activeTab">
                  <Loading v-if="followLoading" />
                  <Transition name="content-reveal">
                    <div
                      v-if="!followLoading && followList.length > 0"
                      class="gh-follow-list"
                      overflow="hidden"
                    >
                      <div
                        v-for="(fu, idx) in followList"
                        :key="fu.uid"
                        class="stagger-row follow-row"
                        :style="{ '--row-index': idx }"
                        @click="openFollowUser(fu.uid)"
                      >
                        <img
                          :src="`https://cdn.luogu.com.cn/upload/usericon/${fu.uid}.png`"
                          style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0"
                          @error="(e: any) => { e.target.onerror = null; e.target.src = fu.avatar }"
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
                            text="xs" px-1.5 py-0.5 rounded-full bg="$bew-fill-2"
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
                    text="center $bew-text-3" py-12
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

                <!-- 比赛:小 tab(参加的 / 创建的) -->
                <div v-else-if="activeTab === 'contests'" key="contests">
                  <nav class="gh-subtabs">
                    <button class="gh-subtab" :class="{ 'gh-subtab--active': contestSub === 'joined' }" @click="contestSub = 'joined'">
                      参加的
                    </button>
                    <button class="gh-subtab" :class="{ 'gh-subtab--active': contestSub === 'created' }" @click="contestSub = 'created'">
                      创建的
                    </button>
                  </nav>
                  <ContestsView :key="`contests-${contestSub}`" embedded :mode="contestSub" />
                </div>

                <ArticleAuthorTab v-else-if="activeTab === 'articles'" key="articles" mode="author" :uid="uid ?? undefined" />

                <!-- 收藏:小 tab(题单 / 专栏) -->
                <div v-else-if="activeTab === 'favorites'" key="favorites">
                  <nav class="gh-subtabs">
                    <button class="gh-subtab" :class="{ 'gh-subtab--active': favSub === 'training' }" @click="favSub = 'training'">
                      题单
                    </button>
                    <button class="gh-subtab" :class="{ 'gh-subtab--active': favSub === 'article' }" @click="favSub = 'article'">
                      专栏
                    </button>
                  </nav>
                  <FavoritesView v-if="favSub === 'training'" key="fav-training" embedded />
                  <ArticleFavTab v-else key="fav-article" mode="fav" />
                </div>

                <DiscussTab v-else-if="activeTab === 'discuss'" key="discuss" />
                <TeamsView v-else-if="activeTab === 'teams'" key="teams" embedded />
              </Transition>
            </div>
          </div>
        </main>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
/* ============================================================
   Pure GitHub profile layout: sticky left sidebar + right main
   ============================================================ */
.gh-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
@media (min-width: 768px) {
  .gh-layout {
    flex-direction: row;
    align-items: stretch;
  }
}

/* ---------- Left sidebar ---------- */
.gh-sidebar-wrap {
  width: 100%;
  flex-shrink: 0;
}
@media (min-width: 768px) {
  .gh-sidebar-wrap {
    width: 300px;
    position: sticky;
    top: calc(var(--bew-top-bar-height) + 16px);
  }
}
.gh-sidebar-card {
  display: flex;
  flex-direction: column;
  /* Stretch with align-items:stretch so the sidebar card matches the right
     main card's height (equal-height columns). */
  height: 100%;
}

.gh-avatar {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bew-fill-2);
  border: 3px solid var(--bew-border-color);
  box-shadow: var(--bew-shadow-1);
  flex-shrink: 0;
}

.gh-name {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.25;
  margin-top: 18px;
  word-break: break-word;
}
.gh-username {
  font-size: 1.1rem;
  color: var(--bew-text-3);
  font-weight: 400;
  margin-top: 2px;
}

.gh-bio {
  font-size: var(--bew-base-font-size);
  color: var(--bew-text-2);
  line-height: 1.6;
  margin-top: 18px;
  word-break: break-word;
  white-space: pre-wrap;
}

.gh-follow-btn {
  margin-top: 18px;
  width: 100%;
  padding: 8px 14px;
  background: var(--bew-theme-color);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-weight: 600;
  font-size: 0.9em;
  cursor: pointer;
  transition: filter 0.2s;
}
.gh-follow-btn:hover {
  filter: brightness(1.1);
}
.gh-follow-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
/* 已关注/互相关注:用低调填充态区别于未关注的主题色 */
.gh-follow-btn--active {
  background: var(--bew-fill-2);
  color: var(--bew-text-1);
  border: 1px solid var(--bew-border-color);
}

.gh-link {
  cursor: pointer;
  transition: color 0.15s;
}
.gh-link:hover strong {
  color: var(--bew-theme-color);
}

.gh-follow-row {
  margin-top: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.9em;
  color: var(--bew-text-2);
}
.gh-follow-row strong {
  color: var(--bew-text-1);
  font-weight: 600;
}

.gh-detail-list {
  list-style: none;
  margin: 20px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 0.9em;
  color: var(--bew-text-2);
}
.gh-detail-list li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gh-detail-list strong {
  color: var(--bew-text-1);
  font-weight: 600;
  margin-left: auto;
}

.gh-gu {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--bew-border-color);
}

/* ---------- Right main ---------- */
.gh-main {
  flex: 1;
  min-width: 0;
}
.gh-main-card {
  /* Fixed viewport height so the inner flex chain (.gh-tab-scroll →
     embedded child → card → body) has a DEFINITE height to distribute via
     flex:1. With only max-height the card would collapse (flex-basis:0
     children contribute nothing to a content-driven height). This also
     makes the right main card fill the viewport, matching the stretched
     left sidebar (equal-height columns). */
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--bew-top-bar-height) - 48px);
  min-height: 320px;
  overflow: hidden;
  padding-top: 16px;
}
.gh-tabs {
  flex-shrink: 0;
  margin-bottom: 0;
  padding: 0 8px;
}
/* Scroll area: tab bar above stays put, this scrolls.
   Global CSS hides all scrollbars; override with higher specificity here so
   this inner scroll has a visible styled thumb. */
.gh-tab-scroll {
  /* flex column so an embedded child that wants to fill (e.g. the practice
     list scrolling internally) can flex:1 to exactly the tab area's height
     without relying on percentage-height resolution (which breaks because
     this element is sized via flex:1 + a max-height ancestor, not a definite
     height). */
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 24px 24px;
  /* Scrollbar hidden — the project hides scrollbars globally for visual
     consistency (see main.scss). Scroll still works via wheel/trackpad/gesture. */
}
/* Make embedded list-card headers sticky inside the scroll area so e.g.
   "已通过 X 题" stays while its list scrolls past. */
.gh-tab-scroll :deep(.embed-list-card > .embed-list-header) {
  position: sticky;
  top: 0;
  z-index: 2;
}

/* GitHub UnderlineNav */
.gh-tabs {
  display: flex;
  align-items: stretch;
  gap: 4px;
  border-bottom: 1px solid var(--bew-border-color);
  overflow-x: auto;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.gh-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  white-space: nowrap;
  color: var(--bew-text-2);
  font-size: var(--bew-base-font-size);
  font-weight: 500;
  transition:
    color 0.2s,
    border-color 0.2s;
}
.gh-tab:hover {
  color: var(--bew-text-1);
}
.gh-tab--active {
  color: var(--bew-text-1);
  border-bottom-color: var(--bew-theme-color);
  font-weight: 600;
}
.gh-tab-count {
  font-size: 0.8em;
  font-weight: 500;
  color: var(--bew-text-3);
  background: var(--bew-fill-2);
  padding: 0 7px;
  border-radius: 999px;
}
.gh-tab--active .gh-tab-count {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-20);
}

/* ---------- 大 tab 内的小 tab(收藏 / 比赛) ---------- */
.gh-subtabs {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
  padding-bottom: 2px;
}
.gh-subtab {
  padding: 5px 14px;
  border: 1px solid var(--bew-border-color);
  border-radius: 999px;
  background: var(--bew-fill-1);
  color: var(--bew-text-2);
  font-size: 0.85em;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}
.gh-subtab:hover {
  background: var(--bew-fill-2);
  color: var(--bew-text-1);
}
.gh-subtab--active {
  background: var(--bew-theme-color);
  border-color: var(--bew-theme-color);
  color: #fff;
}

/* ---------- Shared card (GuluGulu style, GitHub content blocks) ---------- */
.gh-card {
  background: var(--bew-content);
  border-radius: var(--bew-radius);
  padding: 24px;
  border: 1px solid var(--bew-border-color);
  box-shadow: var(--bew-shadow-1), var(--bew-shadow-edge-glow-1);
  backdrop-filter: var(--bew-filter-glass-1);
}
/* Inner section inside the main card — no nested card background, just spacing + title */
.gh-section {
  margin-bottom: 24px;
}
.gh-section:last-child {
  margin-bottom: 0;
}
.gh-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--bew-border-color);
  font-weight: 700;
  color: var(--bew-text-1);
  font-size: var(--bew-base-font-size);
}

/* ---------- Follow list ---------- */
.gh-follow-list {
  border-radius: var(--bew-radius);
  overflow-y: auto;
  border: 1px solid var(--bew-border-color);
  max-height: 60vh;
}
.follow-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--bew-border-color);
  cursor: pointer;
  transition: background 0.15s;
}
.follow-row:last-child {
  border-bottom: none;
}
.follow-row:hover {
  background: var(--bew-fill-2);
}

/* ---------- Heatmap ---------- */
.heatmap-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  overflow-x: auto;
}
.heatmap-grid {
  display: grid;
  gap: 2px;
  min-width: 480px;
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

/* ---------- Introduction (README) ---------- */
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
