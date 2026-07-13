<script setup lang="ts">
export interface ProblemInfo {
  pid: string
  title: string
  difficulty: number
  tags: string[]
  totalSubmit: number
  totalAccepted: number
}

const props = withDefaults(
  defineProps<{
    problem?: ProblemInfo
    skeleton?: boolean
  }>(),
  {
    skeleton: false,
  },
)

const emit = defineEmits<{
  (e: 'click', problem: ProblemInfo): void
}>()

const difficultyColor = computed(() => {
  if (!props.problem)
    return 'var(--bew-text-3)'
  const d = props.problem.difficulty
  if (d <= 1)
    return '#bfbfbf' // gray - 入门
  if (d <= 3)
    return '#1890ff' // blue - medium
  if (d <= 5)
    return '#262626' // black - NOI
  if (d <= 7)
    return '#eb2f96' // pink - very hard
  return '#262626' // black - expert
})

const difficultyLabel = computed(() => {
  if (!props.problem)
    return ''
  const d = props.problem.difficulty
  if (d <= 1)
    return '入门'
  if (d <= 3)
    return '普及-'
  if (d <= 5)
    return '提高'
  if (d <= 7)
    return '省选'
  return 'NOI'
})

const passRate = computed(() => {
  if (!props.problem || props.problem.totalSubmit === 0)
    return 0
  return Math.round((props.problem.totalAccepted / props.problem.totalSubmit) * 100)
})

const passRateColor = computed(() => {
  const rate = passRate.value
  if (rate >= 70)
    return '#52c41a'
  if (rate >= 40)
    return '#faad14'
  return '#ff4d4f'
})

function handleClick() {
  if (props.problem) {
    emit('click', props.problem)
    window.open(`https://www.luogu.com.cn/problem/${props.problem.pid}`, '_blank')
  }
}
</script>

<template>
  <div
    duration-300
    ease-in-out
    rounded="$bew-radius"
    ring="hover:8 hover:$bew-fill-2 active:8 active:$bew-fill-3"
    bg="hover:$bew-fill-2 active:$bew-fill-3"
    transform="~ translate-z-0"
    mb-4
  >
    <!-- Skeleton state -->
    <div
      v-if="skeleton"
      class="problem-card-skeleton"
      w-full
      rounded="$bew-radius"
      p-6
      style="box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1); backdrop-filter: var(--bew-filter-glass-1)"
      bg="$bew-content"
    >
      <div bg="$bew-skeleton" w="80px" h="22px" rounded="$bew-radius-half" mb-3 />
      <div bg="$bew-skeleton" w="75%" h="24px" rounded="$bew-radius-half" mb-3 />
      <div bg="$bew-skeleton" w="50%" h="16px" rounded="$bew-radius-half" mb-3 />
      <div flex="~ gap-2" mt-4>
        <div bg="$bew-skeleton" w="60px" h="22px" rounded="$bew-radius-half" />
        <div bg="$bew-skeleton" w="60px" h="22px" rounded="$bew-radius-half" />
      </div>
    </div>

    <!-- Actual card -->
    <div v-if="!skeleton && problem" class="problem-card group" w="full" rounded="$bew-radius">
      <div
        style="
          box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
          backdrop-filter: var(--bew-filter-glass-1);
        "
        bg="$bew-content"
        p-6
        rounded="$bew-radius"
        cursor="pointer"
        transform="~ translate-z-0"
        duration-300
        group-hover="scale-102"
        border="1 $bew-border-color"
        @click="handleClick"
      >
        <!-- Header: Problem ID badge + Difficulty -->
        <div flex="~ items-center gap-2" mb-3>
          <span
            text="xs"
            fw-bold
            p="x-2 y-0.5"
            rounded="$bew-radius-half"
            bg="$bew-theme-color-20"
            :style="{ color: 'var(--bew-theme-color)' }"
          >
            {{ problem.pid }}
          </span>
          <span
            text="xs"
            p="x-2 y-0.5"
            rounded="$bew-radius-half"
            :style="{
              backgroundColor: `${difficultyColor}20`,
              color: difficultyColor,
            }"
          >
            {{ difficultyLabel }}
          </span>
        </div>

        <!-- Title -->
        <h3
          text="lg $bew-text-1" fw-bold overflow-hidden text-ellipsis whitespace-nowrap
          mb-2
        >
          {{ problem.title }}
        </h3>

        <!-- Pass Rate -->
        <div flex="~ items-center gap-2" mb-3>
          <div text="xs" :style="{ color: passRateColor }">
            通过率 {{ passRate }}%
          </div>
          <span text="xs $bew-text-3">
            {{ problem.totalAccepted?.toLocaleString() }}/{{ problem.totalSubmit?.toLocaleString() }}
          </span>
        </div>

        <!-- Tags -->
        <div flex="~ gap-1 wrap" mt-3>
          <span
            v-for="tag in problem.tags?.slice(0, 4)"
            :key="tag"
            text="xs $bew-text-2"
            p="x-2 y-0.5"
            rounded="$bew-radius-half"
            bg="$bew-fill-1"
            border="1 $bew-border-color"
          >
            {{ tag }}
          </span>
          <span v-if="problem.tags && problem.tags.length > 4" text="xs $bew-text-3" p="x-2 y-0.5">
            +{{ problem.tags.length - 4 }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.problem-card {
  transition:
    transform 300ms ease,
    box-shadow 300ms ease;
}

.problem-card-skeleton {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
