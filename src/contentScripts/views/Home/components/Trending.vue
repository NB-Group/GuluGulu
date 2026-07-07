<script setup lang="ts">
import { renderIcon } from '~/utils/icons'

defineProps<{
  gridLayout?: string
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

onMounted(() => {
  emit('beforeLoading')
  emit('afterLoading')
})

// ============================================================
// Recent Contests
// ============================================================
interface ContestBadge {
  type: string
  color: string
}

interface Contest {
  link: string
  title: string
  status: 'ongoing' | 'upcoming' | 'ended'
  statusText: string
  timeRemaining: string
  dateRange: string
  organizer: string
  organizerUrl: string
  badges: ContestBadge[]
  rated: boolean
}

const contests: Contest[] = [
  {
    link: '/contest/334255',
    title: '[ICPC2017 Shenyang R] ICPC 2017 区域赛沈阳站',
    status: 'ongoing',
    statusText: '进行中',
    timeRemaining: '剩46分',
    dateRange: '07-05 13:00 — 07-05 18:00',
    organizer: '洛谷官方团队',
    organizerUrl: '/team/show?teamid=1000',
    badges: [
      { type: '官方比赛', color: 'red' },
      { type: 'ICPC', color: 'purple' },
    ],
    rated: true,
  },
  {
    link: '/contest/334075',
    title: '【LGR-291-Div.2】洛谷 7 月月赛 II & MX 杯赛',
    status: 'upcoming',
    statusText: '未开始',
    timeRemaining: '4天20时46分后',
    dateRange: '07-10 14:00 — 07-10 18:00',
    organizer: '洛谷官方团队',
    organizerUrl: '/team/show?teamid=1000',
    badges: [
      { type: '官方比赛', color: 'red' },
      { type: 'IOI', color: 'yellow' },
    ],
    rated: true,
  },
  {
    link: '/contest/297106',
    title: '【LGR-288-Div.2】洛谷 7 月月赛 I & 进阶',
    status: 'upcoming',
    statusText: '未开始',
    timeRemaining: '5天20时46分后',
    dateRange: '07-11 14:00 — 07-11 18:00',
    organizer: '洛谷官方团队',
    organizerUrl: '/team/show?teamid=1000',
    badges: [
      { type: '官方比赛', color: 'red' },
      { type: 'IOI', color: 'yellow' },
    ],
    rated: true,
  },
  {
    link: '/contest/334256',
    title: '[ICPC2017 Qingdao R] ICPC 2017 区域赛青岛站',
    status: 'upcoming',
    statusText: '未开始',
    timeRemaining: '6天19时46分后',
    dateRange: '07-12 13:00 — 07-12 18:00',
    organizer: '洛谷官方团队',
    organizerUrl: '/team/show?teamid=1000',
    badges: [
      { type: '官方比赛', color: 'red' },
      { type: 'ICPC', color: 'purple' },
    ],
    rated: true,
  },
  {
    link: '/contest/332884',
    title: '【LGR-290-Div.4】洛谷入门赛 #49',
    status: 'upcoming',
    statusText: '未开始',
    timeRemaining: '7天1时46分后',
    dateRange: '07-12 19:00 — 07-12 21:00',
    organizer: '洛谷官方团队',
    organizerUrl: '/team/show?teamid=1000',
    badges: [
      { type: '官方比赛', color: 'red' },
      { type: 'IOI', color: 'yellow' },
    ],
    rated: true,
  },
  {
    link: '/contest/326863',
    title: 'Algo Beat Contest 009 &「MROI」Round 1',
    status: 'upcoming',
    statusText: '未开始',
    timeRemaining: '12天20时46分后',
    dateRange: '07-18 14:00 — 07-18 18:00',
    organizer: 'Algo Beat Contest 出题组',
    organizerUrl: '/team/show?teamid=91385',
    badges: [
      { type: '团队公开赛', color: 'greendark' },
      { type: 'IOI', color: 'yellow' },
    ],
    rated: true,
  },
  {
    link: '/contest/335418',
    title: '[ICPC 2025 Shanghai R] ICPC 2025 区域赛上海站',
    status: 'upcoming',
    statusText: '未开始',
    timeRemaining: '13天19时46分后',
    dateRange: '07-19 13:00 — 07-19 18:00',
    organizer: '洛谷官方团队',
    organizerUrl: '/team/show?teamid=1000',
    badges: [
      { type: '官方比赛', color: 'red' },
      { type: 'ICPC', color: 'purple' },
    ],
    rated: true,
  },
  {
    link: '/contest/299349',
    title: 'JRKSJ Round 10 庆典 热身赛',
    status: 'ended',
    statusText: '已结束',
    timeRemaining: '比赛已结束',
    dateRange: '07-04 14:00 — 07-04 18:00',
    organizer: 'JRKSJ 出题组',
    organizerUrl: '/team/show?teamid=32209',
    badges: [
      { type: '团队公开赛', color: 'greendark' },
      { type: 'IOI', color: 'yellow' },
    ],
    rated: true,
  },
]

// ============================================================
// Recent Discussions
// ============================================================
interface Discussion {
  title: string
  url: string
  author: string
  authorUrl: string
  authorBadge?: string
  forum: string
  forumUrl: string
  time: string
  replies: number
  pinned: boolean
}

const discussions: Discussion[] = [
  {
    title: 'RemoteJudge 服务中断情况公告',
    url: '/discuss/598533',
    author: '洛谷',
    authorUrl: '/user/3',
    forum: '站务版',
    forumUrl: '/discuss?forum=siteaffairs',
    time: '04-19 15:12',
    replies: 5578,
    pinned: true,
  },
  {
    title: 'JRKSJ Round 10 热身赛 赛后总结',
    url: '/discuss/1313603',
    author: 'cyffff',
    authorUrl: '/user/365127',
    authorBadge: 'Crystal',
    forum: '学术版',
    forumUrl: '/discuss?forum=academics',
    time: '07-04 18:48',
    replies: 74,
    pinned: true,
  },
  {
    title: 'UOJ Long Round #4 || JRKSJ Round 10 联合赛',
    url: '/discuss/1313116',
    author: 'Rainbow_qwq',
    authorUrl: '/user/151935',
    authorBadge: 'Crystal',
    forum: '学术版',
    forumUrl: '/discuss?forum=academics',
    time: '07-03 20:48',
    replies: 81,
    pinned: true,
  },
  {
    title: '新版难度体系更新下的临时难度定价方案说明',
    url: '/discuss/1312513',
    author: 'chen_zhe',
    authorUrl: '/user/8457',
    authorBadge: 'Aya',
    forum: '站务版',
    forumUrl: '/discuss?forum=siteaffairs',
    time: '07-02 18:29',
    replies: 329,
    pinned: true,
  },
  {
    title: '【正在调整中】比赛规范更新与难度体系重构',
    url: '/discuss/1310714',
    author: 'chen_zhe',
    authorUrl: '/user/8457',
    authorBadge: 'Aya',
    forum: '站务版',
    forumUrl: '/discuss?forum=siteaffairs',
    time: '06-27 20:10',
    replies: 964,
    pinned: true,
  },
  {
    title: '【赞助截止】NOI 2026 Avatar Creator 赞助计划',
    url: '/discuss/1307061',
    author: 'shinzAnmono',
    authorUrl: '/user/610557',
    authorBadge: 'szm 妹妹',
    forum: '学术版',
    forumUrl: '/discuss?forum=academics',
    time: '06-18 08:04',
    replies: 187,
    pinned: true,
  },
  {
    title: '2026 年美加墨世界杯专题讨论帖',
    url: '/discuss/1302492',
    author: 'chen_zhe',
    authorUrl: '/user/8457',
    authorBadge: 'Aya',
    forum: '站务版',
    forumUrl: '/discuss?forum=siteaffairs',
    time: '06-06 17:24',
    replies: 2419,
    pinned: true,
  },
  {
    title: '洛谷网校夏季报名指南',
    url: '/discuss/1294802',
    author: '洛谷网校',
    authorUrl: '/user/397',
    authorBadge: '管理员',
    forum: '学术版',
    forumUrl: '/discuss?forum=academics',
    time: '05-20 17:00',
    replies: 118,
    pinned: true,
  },
  {
    title: '安全机制已更新，支持 Passkey 登录验证',
    url: '/discuss/1274629',
    author: '洛谷',
    authorUrl: '/user/3',
    forum: '站务版',
    forumUrl: '/discuss?forum=siteaffairs',
    time: '04-08 18:48',
    replies: 550,
    pinned: true,
  },
  {
    title: '洛谷 2026 CSP-J 初赛课程',
    url: '/discuss/1294813',
    author: '洛谷网校',
    authorUrl: '/user/397',
    authorBadge: '管理员',
    forum: '站务版',
    forumUrl: '/discuss?forum=siteaffairs',
    time: '05-20 17:08',
    replies: 97,
    pinned: true,
  },
  {
    title: '全红求条',
    url: '/discuss/1314079',
    author: 'CYmo_Mh',
    authorUrl: '/user/2073757',
    forum: 'B4558 [GESP202606 三级]',
    forumUrl: '/discuss?forum=B4558',
    time: '07-05 17:11',
    replies: 1,
    pinned: false,
  },
  {
    title: '球找原题的工具（原题机除外）',
    url: '/discuss/1314070',
    author: 'Enoch2013',
    authorUrl: '/user/1069719',
    forum: '学术版',
    forumUrl: '/discuss?forum=academics',
    time: '07-05 16:54',
    replies: 5,
    pinned: false,
  },
  {
    title: '线段树宝林闭关',
    url: '/discuss/1314075',
    author: 'abcd_DaHaoRen',
    authorUrl: '/user/1397536',
    forum: 'P13979 数列分块入门',
    forumUrl: '/discuss?forum=P13979',
    time: '07-05 17:08',
    replies: 0,
    pinned: false,
  },
]

// ============================================================
// Helpers
// ============================================================
function statusColorCSS(status: string): string {
  const map: Record<string, string> = {
    ongoing: 'var(--bew-error-color)',
    upcoming: 'var(--bew-success-color)',
    ended: 'var(--bew-text-4)',
  }
  return map[status] || 'var(--bew-text-3)'
}

function badgeColorCSS(color: string): string {
  const map: Record<string, string> = {
    red: 'var(--bew-error-color)',
    green: 'var(--bew-success-color)',
    greendark: '#2e7d32',
    purple: '#7c3aed',
    yellow: '#b8a028',
  }
  return map[color] || 'var(--bew-text-3)'
}

function openLuoguLink(path: string) {
  window.open(`https://www.luogu.com.cn${path}`, '_blank')
}
</script>

<template>
  <div class="trending-content">
    <!-- ============================================================ -->
    <!-- Recent Contests -->
    <!-- ============================================================ -->
    <div
      style="backdrop-filter: var(--bew-filter-glass-1)"
      bg="$bew-content"
      rounded="12px"
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 solid $bew-border-color"
      p="16px"
      mb="16px"
    >
      <h2 text="base $bew-text-1" fw-bold mb-4>
        近期比赛
      </h2>

      <div flex="~ col" gap-3>
        <div
          v-for="contest in contests"
          :key="contest.link"
          class="contest-card"
          bg="$bew-fill-1"
          rounded="8px"
          p-3
          flex="~ col md:row items-start md:items-center justify-between gap-2"
          cursor-pointer
          duration-300
          @click="openLuoguLink(contest.link)"
        >
          <!-- Left border indicator -->
          <div
            class="contest-border"
            pos="absolute left-0 top-0 bottom-0"
            w-4px
            rounded-l="8px"
            :style="{ backgroundColor: statusColorCSS(contest.status) }"
          />

          <!-- Badges column -->
          <div flex="~ col" gap-1 shrink-0 z-1>
            <span
              v-for="badge in contest.badges"
              :key="badge.type"
              class="contest-badge"
              text="xs white"
              px-2
              py-0.5
              rounded-full
              fw-600
              :style="{ backgroundColor: badgeColorCSS(badge.color) }"
            >
              {{ badge.type }}
            </span>
            <span
              v-if="contest.rated"
              class="contest-badge"
              bg="var(--bew-success-color)"
              text="xs white"
              px-2
              py-0.5
              rounded-full
              fw-600
            >
              Rated
            </span>
          </div>

          <!-- Info column -->
          <div flex="~ col" gap-1 flex-1 min-w-0 z-1>
            <h3 text="sm $bew-text-1" fw-bold truncate>
              {{ contest.title }}
            </h3>
            <div flex="~ items-center gap-2 flex-wrap">
              <strong :style="{ color: statusColorCSS(contest.status) }" text="xs">
                {{ contest.statusText }}
              </strong>
              <span text="xs $bew-text-3">{{ contest.timeRemaining }}</span>
            </div>
            <div text="xs">
              <span
                class="organizer-link"
                text="$bew-text-2"
                cursor-pointer
                @click.stop="openLuoguLink(contest.organizerUrl)"
              >
                {{ contest.organizer }}
              </span>
            </div>
          </div>

          <!-- Date range -->
          <div text="xs $bew-text-3" flex="~ col" gap-0.5 z-1 shrink-0 text-right>
            <span>{{ contest.dateRange.split(' — ')[0] }}</span>
            <span>{{ contest.dateRange.split(' — ')[1] }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- Recent Discussions -->
    <!-- ============================================================ -->
    <div
      style="backdrop-filter: var(--bew-filter-glass-1)"
      bg="$bew-content"
      rounded="12px"
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 solid $bew-border-color"
      p="16px"
      mb="16px"
    >
      <h2 text="base $bew-text-1" fw-bold mb-4>
        最近讨论
      </h2>

      <div flex="~ col">
        <div
          v-for="disc in discussions"
          :key="disc.url"
          class="discussion-item"
          flex="~ items-start gap-3"
          p-3
          border="b-1 solid $bew-border-color"
          duration-200
          cursor-pointer
          @click="openLuoguLink(disc.url)"
        >
          <!-- Content -->
          <div flex="~ col" gap-1 flex-1 min-w-0>
            <div flex="~ items-center gap-2" flex-wrap>
              <h3
                class="discussion-title"
                text="sm $bew-text-1"
                fw-bold
                truncate
              >
                {{ disc.title }}
              </h3>
              <span
                v-if="disc.pinned"
                text="xs white"
                px-1.5
                py-0.5
                rounded-full
                bg="var(--bew-error-color)"
                flex-shrink-0
                fw-600
              >
                置顶
              </span>
            </div>
            <div flex="~ items-center gap-2 flex-wrap" text="xs">
              <span text="$bew-text-2" fw-bold class="disc-author">
                {{ disc.author }}
              </span>
              <span
                v-if="disc.authorBadge"
                text="xs $bew-text-2"
                px-1.5
                py-0
                rounded-full
                bg="var(--bew-fill-2)"
              >
                {{ disc.authorBadge }}
              </span>
              <span text="$bew-text-4">In</span>
              <span
                class="disc-forum"
                text="$bew-text-2"
                cursor-pointer
                @click.stop="openLuoguLink(disc.forumUrl)"
              >
                {{ disc.forum }}
              </span>
              <span text="$bew-text-4">
                @ {{ disc.time }}
              </span>
              <span text="$bew-text-3" flex="~ items-center gap-1">
                <span v-html="renderIcon('mingcute:comment-line', 14)" style="display:contents" />
                {{ disc.replies }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.trending-content {
  max-width: 100%;
}

.contest-card {
  position: relative;
  overflow: hidden;
  transition: box-shadow 200ms ease, transform 200ms ease;

  &:hover {
    box-shadow: var(--bew-shadow-2);
    background: var(--bew-fill-2);
  }
}

.contest-badge {
  white-space: nowrap;
  font-weight: 600;
}

.organizer-link {
  transition: color 200ms ease;

  &:hover {
    color: var(--bew-theme-color);
    text-decoration: underline;
  }
}

.discussion-item {
  transition: background 200ms ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--bew-fill-1);
  }
}

.discussion-title {
  transition: color 200ms ease;
}

.discussion-item:hover .discussion-title {
  color: var(--bew-theme-color);
}

.disc-forum,
.disc-author {
  transition: color 200ms ease;
}

.disc-forum:hover,
.disc-author:hover {
  color: var(--bew-theme-color);
  text-decoration: underline;
}
</style>
