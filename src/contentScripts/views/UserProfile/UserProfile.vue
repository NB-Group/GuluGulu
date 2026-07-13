<script setup lang="ts">
import { useGulyApp } from '~/composables/useAppProvider'
import { AppPage } from '~/enums/appEnums'
import { ccfColor, ccfLabel, diffColor } from '~/utils/difficulty'
import { renderIcon } from '~/utils/icons'
import { parseMarkdownContent } from '~/utils/markdown'

const { navigateTo } = useGulyApp()

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

const user = ref<UserData | null>(null)
const currentViewer = ref<any>(null)
const prizes = ref<any[]>([])
const gu = ref<any>(null)
const dailyCounts = ref<Record<string, [number, number]>>({})
const loading = ref(true)
const errorMsg = ref('')
const followList = ref<any[]>([])
const isOwnProfile = computed(() => {
  const myUid = (window as any).__guly_user?.uid
  return myUid && String(uid.value) === String(myUid)
})
const followLoading = ref(false)

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
    }
  }
  catch {}
  followLoading.value = false
}

function navigateToFollow(type: 'following' | 'followers' | 'back') {
  if (type === 'back') {
    navigateTo(AppPage.UserProfile, `https://www.luogu.com.cn/user/${uid.value}`)
  }
  else {
    navigateTo(
      AppPage.UserProfile,
      `https://www.luogu.com.cn/user/${uid.value}/${type === 'followers' ? 'follower' : 'following'}`,
    )
  }
}
function openFollowUser(uid2: number) {
  navigateTo(AppPage.UserProfile, `https://www.luogu.com.cn/user/${uid2}`)
}
const quickEntries = computed(() => {
  const id = uid.value
  return [
    {
      label: '通知',
      icon: 'mingcute:notification-line',
      color: '#e74c3c',
      onClick: () => navigateTo(AppPage.Notification, 'https://www.luogu.com.cn/user/notification'),
    },
    {
      label: '练习',
      icon: 'mingcute:chart-bar-line',
      color: '#52c41a',
      onClick: () => navigateTo(AppPage.Practice, `https://www.luogu.com.cn/user/${id}/practice`),
    },
    {
      label: '题库',
      icon: 'mingcute:code-line',
      color: '#3498db',
      onClick: () => navigateTo(AppPage.MyProblems, 'https://www.luogu.com.cn/user/mine/problem'),
    },
    {
      label: '比赛',
      icon: 'mingcute:trophy-line',
      color: '#f39c12',
      onClick: () => navigateTo(AppPage.MyContests, 'https://www.luogu.com.cn/user/mine/contestJoined'),
    },
    {
      label: '收藏',
      icon: 'mingcute:bookmark-line',
      color: '#722ed1',
      onClick: () => navigateTo(AppPage.TrainingFav, 'https://www.luogu.com.cn/user/mine/trainingFav'),
    },
    {
      label: '团队',
      icon: 'mingcute:group-line',
      color: '#13c2c2',
      onClick: () => navigateTo(AppPage.Team, 'https://www.luogu.com.cn/user/mine/team'),
    },
  ]
})

const relationshipLabel = computed(() => {
  const r = user.value?.userRelationship || 0
  if (r === 2 || r === 3)
    return '互相关注'
  if (r === 1)
    return '已关注'
  return null
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
      currentViewer.value = ctx?.user || null
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
function cellColor(level: number, count: number): string {
  if (count <= 0)
    return 'var(--bew-fill-2)'
  const opacities = ['22', '44', '66', '88', 'AA', 'CC', 'FF']
  return `${diffColor(level)}${opacities[Math.min(count, 6)] || opacities[6]}`
}
function cellTooltip(cell: HeatCell): string {
  if (cell.count === 0)
    return `${cell.date} — 无提交`
  return `${cell.date} — ${cell.count} 题`
}

onMounted(() => {
  if (subView.value)
    fetchFollowList(subView.value)
  else fetchUser()
})
watch(uid, () => {
  if (uid.value && !subView.value)
    fetchUser()
})
watch(subView, (v) => {
  if (v)
    fetchFollowList(v)
})
</script>

<template>
  <!-- ============================================================ -->
  <!-- Following / Followers Sub-View -->
  <!-- ============================================================ -->
  <div
    v-if="subView" class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16"
    pos="relative"
  >
    <div
      bg="$bew-content"
      rounded="$bew-radius"
      p-6
      mb-6
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 $bew-border-color"
      style="backdrop-filter: var(--bew-filter-glass-1)"
    >
      <button
        style="
          background: none;
          border: none;
          cursor: pointer;
          color: var(--bew-theme-color);
          font-size: var(--bew-base-font-size);
        "
        mb-2
        @click="navigateToFollow('back')"
      >
        ← 返回用户主页
      </button>
      <h1 style="font-size: 1.25rem; color: var(--bew-text-1); font-weight: 700">
        {{ subView === 'following' ? '关注' : '粉丝' }}
      </h1>
    </div>
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
            @error="
              (e: any) => {
                e.target.style.display = 'none'
              }
            "
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
        暂无{{ subView === 'following' ? '关注' : '粉丝' }}
      </p>
    </div>
  </div>

  <!-- ============================================================ -->
  <!-- Profile View -->
  <!-- ============================================================ -->
  <div
    v-else class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16"
    pos="relative"
  >
    <Loading v-if="loading" />
    <div
      v-if="!loading && errorMsg"
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
      <div v-if="!loading && user" w-full>
        <!-- Profile Card -->
        <div
          bg="$bew-content"
          rounded="$bew-radius"
          p-6
          mb-6
          shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
          border="1 $bew-border-color"
          style="backdrop-filter: var(--bew-filter-glass-1)"
        >
          <div flex="~ col md:row gap-6" items="start md:items-center">
            <!-- Avatar -->
            <div flex="~ col" items="center" gap-2 shrink-0>
              <div
                w="80px"
                h="80px"
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
              <div
                class="container"
                style="
                  width: 100%;
                  display: flex;
                  text-align: center;
                  align-items: center;
                  flex-direction: row;
                  justify-content: space-evenly;
                "
              >
                <span :style="{ color: ccfColor(user.ccfLevel), width: '1em', display: 'inline-block' }"><svg
                  class="svg-inline--fa fa-badge-check"
                  data-prefix="fad"
                  data-icon="badge-check"
                  role="img"
                  viewBox="0 0 512 512"
                  aria-hidden="true"
                >
                  <g class="fa-duotone-group">
                    <path
                      class="fa-secondary"
                      fill="currentColor"
                      d="M0 256C0 292.8 20.7 324.8 51.1 340.9 41 373.8 49 411 75 437s63.3 34 96.1 23.9C187.2 491.3 219.2 512 256 512s68.8-20.7 84.9-51.1C373.8 471 411 463 437 437s34-63.3 23.9-96.1C491.3 324.8 512 292.8 512 256s-20.7-68.8-51.1-84.9C471 138.2 463 101 437 75s-63.3-34-96.1-23.9C324.8 20.7 292.8 0 256 0s-68.8 20.7-84.9 51.1C138.2 41 101 49 75 75s-34 63.3-23.9 96.1C20.7 187.2 0 219.2 0 256zm152.3 41.6c-9.2-9.5-9-24.7 .6-33.9 9.5-9.2 24.7-8.9 33.9 .6l35.8 37 106.1-145.8c7.8-10.7 22.8-13.1 33.5-5.3 10.7 7.8 13.1 22.8 5.3 33.5L244.7 352.7c-4.2 5.7-10.7 9.4-17.8 9.8-7.1 .5-14-2.2-18.9-7.3l-55.7-57.6z"
                    />
                    <path
                      class="fa-primary"
                      fill="#FFFFFF"
                      d="M328.7 155.5c7.8-10.7 22.8-13.1 33.5-5.3 10.7 7.8 13.1 22.8 5.3 33.5L244.7 352.7c-4.2 5.7-10.7 9.4-17.8 9.8-7.1 .5-14-2.2-18.9-7.3l-55.7-57.6c-9.2-9.5-9-24.7 .6-33.9 9.5-9.2 24.7-8.9 33.9 .6l35.8 37 106.1-145.8z"
                    />
                  </g></svg></span>
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
              </div>
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

            <!-- Info -->
            <div flex="~ col 1" gap-2>
              <div flex="~ items-center gap-3">
                <h1 style="font-size: 1.5rem; font-weight: 700" :style="{ color: colorVar(user.color) }">
                  {{ user.name }}
                </h1>
                <span text="xs $bew-text-2" px-2 py-0.5 rounded-full bg="$bew-fill-1">UID: {{ user.uid }}</span>
              </div>
              <p v-if="user.slogan" style="font-size: var(--bew-base-font-size); color: var(--bew-text-2)">
                {{ user.slogan }}
              </p>
              <div flex="~ gap-1 wrap" style="font-size: var(--bew-base-font-size); color: var(--bew-text-3)">
                <span
                  style="cursor: pointer; text-decoration: none; color: var(--bew-text-3)"
                  @click="navigateToFollow('following')"
                >关注 <strong style="color: var(--bew-text-1)">{{ user.followingCount }}</strong></span>
                <span mx-1>|</span>
                <span
                  style="cursor: pointer; text-decoration: none; color: var(--bew-text-3)"
                  @click="navigateToFollow('followers')"
                >粉丝 <strong style="color: var(--bew-text-1)">{{ user.followerCount }}</strong></span>
                <span mx-1>|</span>
                <span>排名 <strong style="color: var(--bew-text-1)">#{{ user.ranking.toLocaleString() }}</strong></span>
                <span mx-1>|</span>
                <span>注册于 {{ formatDate(user.registerTime) }}</span>
              </div>
              <!-- GU Score -->
              <div v-if="gu" flex="~ gap-3" style="font-size: var(--bew-base-font-size)">
                <span>总咕值: <strong style="color: var(--bew-warning-color)">{{ gu.rating || 0 }}</strong></span>
                <span>信用: <strong style="color: var(--bew-success-color)">{{ gu.scores?.basic || 0 }}</strong></span>
                <span>练习: <strong style="color: var(--bew-success-color)">{{ gu.scores?.practice || 0 }}</strong></span>
                <span>比赛: <strong style="color: var(--bew-theme-color)">{{ gu.scores?.contest || 0 }}</strong></span>
                <span>贡献: <strong style="color: var(--bew-text-3)">{{ gu.scores?.social || 0 }}</strong></span>
                <span>成就: <strong style="color: var(--bew-text-3)">{{ gu.scores?.prize || 0 }}</strong></span>
              </div>
            </div>
          </div>

          <!-- Introduction -->
          <div
            v-if="user.introduction"
            mt-4
            p-4
            rounded="$bew-radius"
            bg="$bew-fill-1"
            class="profile-intro"
            v-html="parseMarkdownContent(user.introduction)"
          />
        </div>

        <!-- Stats -->
        <div grid="~ cols-2 md:cols-4" gap-4 mb-6>
          <div
            v-for="stat in [
              { label: '通过', value: user.passedProblemCount, icon: 'check-circle-line', color: '#52c41a' },
              { label: '提交', value: user.submittedProblemCount, icon: 'code-line', color: '#1890ff' },
              { label: '粉丝', value: user.followerCount, icon: 'user-4-line', color: '#722ed1' },
              { label: '关注', value: user.followingCount, icon: 'user-follow-line', color: '#faad14' },
            ]"
            :key="stat.label"
            bg="$bew-content"
            rounded="$bew-radius"
            p-4
            shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
            border="1 $bew-border-color"
            style="backdrop-filter: var(--bew-filter-glass-1)"
            flex="~ items-center gap-3"
          >
            <span
              :style="{ color: stat.color, display: 'contents' }"
              v-html="renderIcon(`mingcute:${stat.icon}`, 24)"
            />
            <div>
              <div style="font-size: var(--bew-base-font-size); color: var(--bew-text-3)">
                {{ stat.label }}
              </div>
              <div style="font-size: 1.2rem; font-weight: 700; color: var(--bew-text-1)">
                {{ (stat.value || 0).toLocaleString() }}
              </div>
            </div>
          </div>
        </div>

        <!-- Quick entry buttons (own profile only) -->
        <div v-if="isOwnProfile" flex="~ gap-2" mb-6>
          <div
            v-for="item in quickEntries"
            :key="item.label"
            class="quick-entry-btn"
            cursor="pointer"
            flex="~ items-center gap-1.5"
            px-4
            py-2
            rounded-full
            :style="{ background: `${item.color}18`, border: `1px solid ${item.color}40` }"
            @click="item.onClick"
          >
            <span :style="{ color: item.color, display: 'contents' }" v-html="renderIcon(item.icon, 16)" />
            <span style="font-size: 0.85em; font-weight: 600" :style="{ color: item.color }">{{ item.label }}</span>
            <span
              style="display: contents; color: var(--bew-text-4)"
              v-html="renderIcon('mingcute:arrow-right-line', 14)"
            />
          </div>
        </div>

        <!-- Heatmap -->
        <div
          v-if="Object.keys(dailyCounts).length > 0"
          bg="$bew-content"
          rounded="$bew-radius"
          p-6
          mb-6
          shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
          border="1 $bew-border-color"
          style="backdrop-filter: var(--bew-filter-glass-1)"
          overflow="auto"
        >
          <h2 style="font-size: var(--bew-base-font-size); color: var(--bew-text-1); font-weight: 700" mb-3>
            练习记录
          </h2>
          <div class="heatmap" style="min-width: fit-content">
            <!-- Month labels -->
            <div flex="~" style="margin-left: 28px; font-size: 10px; color: var(--bew-text-4)" mb-1>
              <span
                v-for="m in heatmapMonths"
                :key="m.startWeek"
                :style="{
                  marginLeft: m.startWeek === 0 ? '0' : '0',
                  width: m.startWeek === heatmapMonths[0]?.startWeek ? 'auto' : 'auto',
                  flex: '1',
                }"
                v-text="m.label"
              />
            </div>
            <div flex="~">
              <!-- Day labels -->
              <div flex="~ col" style="gap: 3px; margin-right: 6px; font-size: 10px; color: var(--bew-text-4)" py-2>
                <span
                  v-for="day in ['一', '', '三', '', '五', '', '日']"
                  :key="day"
                  style="height: 12px; line-height: 12px"
                >{{ day }}</span>
              </div>
              <!-- Heatmap grid -->
              <div flex="~" style="gap: 3px">
                <div v-for="(week, wi) in heatmapWeeks" :key="wi" flex="~ col" style="gap: 3px">
                  <div
                    v-for="(cell, di) in week"
                    :key="di"
                    class="heat-cell"
                    style="width: 16px; height: 16px; border-radius: 2px"
                    :style="{ background: cellColor(cell.level, cell.count) }"
                  >
                    <span class="heat-tooltip">{{ cellTooltip(cell) }}</span>
                  </div>
                </div>
              </div>
            </div>
            <!-- Legend -->
            <div flex="~ items-center justify-end gap-1" mt-2 style="font-size: 10px; color: var(--bew-text-4)">
              <span>少</span>
              <span
                v-for="lv in [0, 1, 3, 5, 6]"
                :key="lv"
                style="width: 12px; height: 12px; border-radius: 2px"
                :style="{ background: cellColor(3, lv) }"
              />
              <span>多</span>
            </div>
          </div>
        </div>

        <!-- Prizes -->
        <div
          v-if="prizes.length > 0"
          bg="$bew-content"
          rounded="$bew-radius"
          p-6
          mb-6
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
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.quick-entry-btn {
  transition: all 0.2s;
}
.quick-entry-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
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
