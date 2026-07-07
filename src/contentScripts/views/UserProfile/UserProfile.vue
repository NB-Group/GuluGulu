<script setup lang="ts">
import { renderIcon } from '~/utils/icons'

const props = defineProps<{
  uid?: string
}>()

// Extract UID from URL if no prop
function extractUidFromUrl(): string {
  const match = document.URL.match(/\/user\/(\d+)/i)
  return match?.[1] || '1'
}

const userId = computed(() => props.uid || extractUidFromUrl())

interface RecentActivity {
  id: string
  type: 'ac' | 'contest' | 'blog' | 'submit'
  title: string
  time: number
  detail?: string
}

const now = Math.floor(Date.now() / 1000)
const hour = 3600

const mockUser = {
  uid: '1',
  username: 'NaCly_Fish',
  avatar: '',
  rating: 3241,
  rank: 1,
  bio: '一名热爱算法的 OIer，喜欢数学和数据结构。Fish & Chips!',
  followingCount: 42,
  followerCount: 1024,
  solvedCount: 1847,
  contestCount: 156,
  blogCount: 23,
  discussCount: 67,
  registerDate: '2019-03-15',
}

const recentActivities: RecentActivity[] = [
  { id: '1', type: 'ac', title: 'AC 了 P9999 超难题目', time: now - hour * 1, detail: '100 分' },
  { id: '2', type: 'contest', title: '参加了 洛谷 2024 七月月赛 Div.1', time: now - hour * 3, detail: 'Rank 5' },
  { id: '3', type: 'ac', title: 'AC 了 P8888 中等题目', time: now - hour * 6, detail: '100 分' },
  { id: '4', type: 'blog', title: '发表了博客：动态规划从入门到精通', time: now - hour * 12, detail: '' },
  { id: '5', type: 'ac', title: 'AC 了 P7777 简单题目', time: now - hour * 24, detail: '100 分' },
  { id: '6', type: 'submit', title: '提交了 P6666 的解答', time: now - hour * 36, detail: '50 分' },
]

const activityIcons: Record<string, string> = {
  ac: 'mingcute:check-circle-fill',
  contest: 'mingcute:trophy-fill',
  blog: 'mingcute:comment-fill',
  submit: 'mingcute:code-fill',
}

const activityColors: Record<string, { icon: string; bg: string }> = {
  ac: { icon: '#52c41a', bg: '#52c41a15' },
  contest: { icon: '#1890ff', bg: '#1890ff15' },
  blog: { icon: '#722ed1', bg: '#722ed115' },
  submit: { icon: '#faad14', bg: '#faad1415' },
}

function getRatingColor(rating: number): string {
  if (rating >= 3000)
    return '#FF0000'
  if (rating >= 2600)
    return '#FF8C00'
  if (rating >= 2200)
    return '#AA00AA'
  if (rating >= 1800)
    return '#0000FF'
  if (rating >= 1400)
    return '#03A89E'
  return '#808080'
}

function getRatingLabel(rating: number): string {
  if (rating >= 3000)
    return 'NOI 巨佬'
  if (rating >= 2600)
    return '省选'
  if (rating >= 2200)
    return '提高'
  if (rating >= 1800)
    return '普及+/提高'
  if (rating >= 1400)
    return '普及'
  return '入门'
}

function formatTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 3600)
    return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400)
    return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}

function openOriginalPage() {
  window.open(`https://www.luogu.com.cn/user/${userId.value}`, '_blank')
}
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <!-- User Profile Card -->
    <div
      bg="$bew-content" rounded="$bew-radius" p-6 mb-6
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 $bew-border-color"
      style="backdrop-filter: var(--bew-filter-glass-1)"
    >
      <div flex="~ col md:row gap-6" items="start md:items-center">
        <!-- Avatar area -->
        <div flex="~ col" items="center" gap-3 shrink-0>
          <div
            w="80px" h="80px" rounded-full overflow-hidden
            bg="$bew-fill-2"
            flex="~" items="center" justify="center"
            border="3 solid" pos="relative"
            :style="{ borderColor: `${getRatingColor(mockUser.rating)}40` }"
          >
            <img
              :src="`https://cdn.luogu.com.cn/upload/usericon/${userId}.png`"
              style="width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0;"
              @error="(e) => { (e.target as HTMLImageElement).style.display = 'none' }"
            >
            <span v-html="renderIcon('mingcute:user-4-line', 32)" :style="{ color: getRatingColor(mockUser.rating) }" style="pointer-events: none;" />
          </div>
          <span
            text="xs" fw-bold p="x-2 y-0.5" rounded="$bew-radius-half"
            :style="{
              backgroundColor: `${getRatingColor(mockUser.rating)}20`,
              color: getRatingColor(mockUser.rating),
            }"
          >
            {{ getRatingLabel(mockUser.rating) }}
          </span>
        </div>

        <!-- User info -->
        <div flex="~ col 1" gap-2>
          <div flex="~ items-center gap-3">
            <h1 text="2xl" fw-bold :style="{ color: getRatingColor(mockUser.rating) }">
              {{ mockUser.username }}
            </h1>
            <span text="xs $bew-text-2" p="x-2 y-0.5" rounded="$bew-radius-half" bg="$bew-fill-1">
              UID: {{ mockUser.uid }}
            </span>
          </div>

          <div flex="~ items-center gap-2">
            <span text="2xl" fw-bold :style="{ color: getRatingColor(mockUser.rating) }">
              {{ mockUser.rating }}
            </span>
            <span text="sm $bew-text-2">
              Rating / Rank #{{ mockUser.rank }}
            </span>
          </div>

          <p text="sm $bew-text-2">{{ mockUser.bio }}</p>

          <div flex="~ gap-1 wrap">
            <span text="xs $bew-text-3">关注 {{ mockUser.followingCount }}</span>
            <span text="xs $bew-text-3" mx-1>|</span>
            <span text="xs $bew-text-3">粉丝 {{ mockUser.followerCount }}</span>
            <span text="xs $bew-text-3" mx-1>|</span>
            <span text="xs $bew-text-3">注册于 {{ mockUser.registerDate }}</span>
          </div>
        </div>

        <!-- Action -->
        <Button type="secondary" shrink-0 @click="openOriginalPage">
          <span v-html="renderIcon('mingcute:external-link-line', 16)" style="display:contents" />
          原站查看
        </Button>
      </div>
    </div>

    <!-- Stats Section -->
    <div
      grid="~ cols-2 md:cols-4" gap-4 mb-6
    >
      <div
        v-for="stat in [
          { label: '已通过', value: mockUser.solvedCount, icon: 'mingcute:check-circle-line' },
          { label: '比赛参与', value: mockUser.contestCount, icon: 'mingcute:trophy-line' },
          { label: '博客', value: mockUser.blogCount, icon: 'mingcute:comment-line' },
          { label: '讨论', value: mockUser.discussCount, icon: 'mingcute:message-line' },
        ]"
        :key="stat.label"
        bg="$bew-content" rounded="$bew-radius" p-4
        shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
        border="1 $bew-border-color"
        style="backdrop-filter: var(--bew-filter-glass-1)"
        flex="~ col" items="center" gap-1
      >
        <span v-html="renderIcon(stat.icon, 24)" style="display:contents; color: var(--bew-theme-color);" />
        <span text="2xl $bew-text-1" fw-bold>{{ stat.value }}</span>
        <span text="xs $bew-text-3">{{ stat.label }}</span>
      </div>
    </div>

    <!-- Recent Activities -->
    <div
      bg="$bew-content" rounded="$bew-radius"
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 $bew-border-color"
      style="backdrop-filter: var(--bew-filter-glass-1)"
      overflow="hidden"
    >
      <div bg="$bew-fill-1" p="x-6 y-3" border="b-1 $bew-border-color">
        <h2 text="lg $bew-text-1" fw-bold>最近活动</h2>
      </div>

      <div
        v-for="(activity, index) in recentActivities"
        :key="activity.id"
        flex="~ items-center gap-3" p="x-6 y-3"
        border="b-1 $bew-border-color"
        :class="index === recentActivities.length - 1 ? '' : ''"
      >
        <div
          w="32px" h="32px" rounded-full
          flex="~" items="center" justify="center" shrink-0
          :style="{ backgroundColor: activityColors[activity.type].bg }"
        >
          <span v-html="renderIcon(activityIcons[activity.type], 18)" :style="{ color: activityColors[activity.type].icon }" style="display:contents" />
        </div>
        <div flex="~ col 1" gap-0.5>
          <span text="sm $bew-text-1">{{ activity.title }}</span>
          <span text="xs $bew-text-3">{{ formatTime(activity.time) }}</span>
        </div>
        <span
          v-if="activity.detail"
          text="xs $bew-text-2" fw-bold
        >{{ activity.detail }}</span>
      </div>
    </div>
  </div>
</template>
