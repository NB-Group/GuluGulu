<script setup lang="ts">
export interface ContestInfo {
  id: string
  name: string
  startTime: number
  endTime: number
  status: 'upcoming' | 'ongoing' | 'ended'
  type: string
  rated: boolean
}

const props = withDefaults(defineProps<{
  contest?: ContestInfo
  skeleton?: boolean
}>(), {
  skeleton: false,
})

const emit = defineEmits<{
  (e: 'click', contest: ContestInfo): void
}>()

const statusConfig = computed(() => {
  if (!props.contest)
    return { label: '', color: 'var(--bew-text-3)', bg: 'var(--bew-fill-1)' }
  switch (props.contest.status) {
    case 'ongoing':
      return { label: '进行中', color: '#52c41a', bg: '#52c41a20' }
    case 'upcoming':
      return { label: '未开始', color: '#1890ff', bg: '#1890ff20' }
    case 'ended':
      return { label: '已结束', color: '#ff4d4f', bg: '#ff4d4f20' }
  }
})

const timeRange = computed(() => {
  if (!props.contest)
    return ''
  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${formatTime(props.contest.startTime)} - ${formatTime(props.contest.endTime)}`
})

const typeLabel = computed(() => {
  if (!props.contest)
    return ''
  switch (props.contest.type) {
    case 'OI':
      return 'OI'
    case 'IOI':
      return 'IOI'
    case 'ACM':
      return 'ACM'
    case 'CF':
      return 'CF'
    default:
      return props.contest.type
  }
})

function handleClick() {
  if (props.contest) {
    emit('click', props.contest)
    window.open(`https://www.luogu.com.cn/contest/${props.contest.id}`, '_blank')
  }
}
</script>

<template>
  <div
    duration-300 ease-in-out
    rounded="$bew-radius"
    ring="hover:8 hover:$bew-fill-2 active:8 active:$bew-fill-3"
    bg="hover:$bew-fill-2 active:$bew-fill-3"
    transform="~ translate-z-0"
    mb-4
  >
    <!-- Skeleton state -->
    <div
      v-if="skeleton"
      class="contest-card-skeleton"
      w-full rounded="$bew-radius" p-6
      style="
        box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
        backdrop-filter: var(--bew-filter-glass-1);
      "
      bg="$bew-content"
    >
      <div bg="$bew-skeleton" w="60%" h="24px" rounded="$bew-radius-half" mb-3 />
      <div bg="$bew-skeleton" w="40%" h="16px" rounded="$bew-radius-half" mb-2 />
      <div flex="~ gap-2" mt-4>
        <div bg="$bew-skeleton" w="70px" h="22px" rounded="$bew-radius-half" />
        <div bg="$bew-skeleton" w="50px" h="22px" rounded="$bew-radius-half" />
        <div bg="$bew-skeleton" w="40px" h="22px" rounded="$bew-radius-half" />
      </div>
    </div>

    <!-- Actual card -->
    <div
      v-if="!skeleton && contest"
      class="contest-card group"
      w="full"
      rounded="$bew-radius"
    >
      <div
        style="
          box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
          backdrop-filter: var(--bew-filter-glass-1);
        "
        bg="$bew-content"
        p-6 rounded="$bew-radius"
        cursor="pointer"
        transform="~ translate-z-0"
        duration-300
        group-hover="scale-102"
        border="1 $bew-border-color"
        @click="handleClick"
      >
        <!-- Status badge -->
        <div flex="~ items-center gap-2" mb-3>
          <span
            text="xs" fw-bold
            p="x-2 y-0.5"
            rounded="$bew-radius-half"
            :style="{
              backgroundColor: statusConfig.bg,
              color: statusConfig.color,
            }"
          >
            {{ statusConfig.label }}
          </span>
        </div>

        <!-- Contest name -->
        <h3
          text="lg $bew-text-1" fw-bold
          overflow-hidden text-ellipsis
          style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;"
          mb-2
        >
          {{ contest.name }}
        </h3>

        <!-- Time range -->
        <div text="sm $bew-text-2" mb-3>
          <div i-mingcute:time-line mr-1 inline-block />
          {{ timeRange }}
        </div>

        <!-- Type and Rated badges -->
        <div flex="~ gap-1 wrap" mt-3>
          <span
            text="xs $bew-text-2"
            p="x-2 y-0.5"
            rounded="$bew-radius-half"
            bg="$bew-theme-color-20"
            :style="{ color: 'var(--bew-theme-color)' }"
          >
            {{ typeLabel }}
          </span>
          <span
            v-if="contest.rated"
            text="xs $bew-text-2"
            p="x-2 y-0.5"
            rounded="$bew-radius-half"
            bg="$bew-warning-color-20"
            :style="{ color: 'var(--bew-warning-color)' }"
          >
            Rated
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.contest-card {
  transition: transform 300ms ease, box-shadow 300ms ease;
}

.contest-card-skeleton {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
