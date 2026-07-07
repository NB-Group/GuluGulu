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

interface Contest {
  id: number
  title: string
  type: string
  status: 'upcoming' | 'ongoing' | 'ended'
  date: string
  participants: number
}

const contests: Contest[] = [
  { id: 1, title: '洛谷 7月月赛 Div.2', type: '月赛', status: 'upcoming', date: '2026-07-12', participants: 2340 },
  { id: 2, title: 'Codeforces Round #942', type: '外部比赛', status: 'upcoming', date: '2026-07-08', participants: 1560 },
  { id: 3, title: '2026 省选模拟赛 #3', type: '模拟赛', status: 'upcoming', date: '2026-07-15', participants: 890 },
  { id: 4, title: '洛谷 6月月赛 Div.1', type: '月赛', status: 'ended', date: '2026-06-28', participants: 3100 },
  { id: 5, title: 'AtCoder Beginner Contest 358', type: '外部比赛', status: 'ended', date: '2026-06-22', participants: 2100 },
  { id: 6, title: '蓝桥杯 2026 模拟赛 #2', type: '模拟赛', status: 'ended', date: '2026-06-15', participants: 4500 },
]

function statusText(status: string): string {
  const map: Record<string, string> = {
    upcoming: '即将开始',
    ongoing: '进行中',
    ended: '已结束',
  }
  return map[status] || status
}

function statusBgClass(status: string): string {
  const map: Record<string, string> = {
    upcoming: 'var(--bew-success-color)',
    ongoing: 'var(--bew-error-color)',
    ended: 'var(--bew-text-4)',
  }
  return map[status] || 'var(--bew-text-4)'
}
</script>

<template>
  <div>
    <div
      style="backdrop-filter: var(--bew-filter-glass-1)"
      bg="$bew-content"
      rounded="12px"
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 solid $bew-border-color"
      p="16px"
      mb="16px"
    >
      <div mb-4>
        <h2 text="base $bew-text-1" fw-bold>
          近期比赛
        </h2>
        <p text="xs $bew-text-3" mt-1>
          即将开始和最近结束的比赛
        </p>
      </div>

      <div grid="~ cols-1 md:cols-2 lg:cols-3 gap-4">
        <div
          v-for="contest in contests"
          :key="contest.id"
          class="contest-card"
          bg="$bew-fill-1"
          rounded="8px"
          p-3
          cursor-pointer
          shadow="[var(--bew-shadow-1)]"
          border="1 solid $bew-border-color"
          duration-300
        >
          <div flex="~ items-center justify-between" mb-2>
            <span
              :style="{
                color: statusBgClass(contest.status),
                backgroundColor: `color-mix(in oklab, ${statusBgClass(contest.status)}, transparent 85%)`,
              }"
              text="xs"
              px-2
              py-1
              rounded-full
              fw-600
            >
              {{ statusText(contest.status) }}
            </span>
            <span text="xs $bew-text-2" px-2 py-1 rounded-full bg="$bew-fill-2">
              {{ contest.type }}
            </span>
          </div>

          <h3 text="sm $bew-text-1" fw-bold mb-2>
            {{ contest.title }}
          </h3>

          <div flex="~ items-center gap-4" text="xs $bew-text-3" mt-3>
            <div flex="~ items-center gap-1">
              <span v-html="renderIcon('mingcute:calendar-line', 14)" style="display:contents" />
              <span>{{ contest.date }}</span>
            </div>
            <div flex="~ items-center gap-1">
              <span v-html="renderIcon('mingcute:user-4-line', 14)" style="display:contents" />
              <span>{{ contest.participants.toLocaleString() }} 人参与</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.contest-card {
  backdrop-filter: var(--bew-filter-glass-1);
  transition: box-shadow 200ms ease, transform 200ms ease;

  &:hover {
    box-shadow: var(--bew-shadow-2) !important;
    transform: translateY(-2px);
  }
}
</style>
