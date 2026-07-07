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

interface Problem {
  id: string
  title: string
  difficulty: string
  tags: string[]
  passRate: number
}

const problems: Problem[] = [
  { id: 'P1001', title: 'A+B Problem', difficulty: '入门', tags: ['入门', '模拟'], passRate: 68.5 },
  { id: 'P3370', title: '【模板】字符串哈希', difficulty: '普及-', tags: ['哈希', '字符串'], passRate: 42.3 },
  { id: 'P3371', title: '【模板】单源最短路径', difficulty: '普及/提高-', tags: ['图论', '最短路'], passRate: 38.7 },
  { id: 'P3865', title: '【模板】ST 表', difficulty: '普及/提高-', tags: ['数据结构', 'RMQ'], passRate: 45.1 },
  { id: 'P3366', title: '【模板】最小生成树', difficulty: '普及-', tags: ['图论', 'MST'], passRate: 52.4 },
  { id: 'P3383', title: '【模板】线性筛素数', difficulty: '普及-', tags: ['数论', '筛法'], passRate: 48.9 },
  { id: 'P1177', title: '【模板】排序', difficulty: '普及-', tags: ['排序', '分治'], passRate: 55.2 },
  { id: 'P5788', title: '【模板】单调栈', difficulty: '普及/提高-', tags: ['数据结构', '单调栈'], passRate: 41.8 },
]

function difficultyColor(difficulty: string): string {
  const map: Record<string, string> = {
    '入门': '#67c23a',
    '普及-': '#409eff',
    '普及/提高-': '#e6a23c',
    '普及+/提高': '#f56c6c',
    '提高+/省选-': '#9c27b0',
    '省选/NOI-': '#ff5722',
  }
  return map[difficulty] || '#909399'
}

function openProblemLink(pid: string) {
  window.open(`https://www.luogu.com.cn/problem/${pid}`, '_blank')
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
          热门题目
        </h2>
        <p text="xs $bew-text-3" mt-1>
          最近备受关注的算法题目
        </p>
      </div>

      <div grid="~ cols-1 md:cols-2 lg:cols-3 gap-4">
        <div
          v-for="problem in problems"
          :key="problem.id"
          class="problem-card"
          bg="$bew-fill-1"
          rounded="8px"
          p-3
          cursor-pointer
          shadow="[var(--bew-shadow-1)]"
          border="1 solid $bew-border-color"
          duration-300
          @click="openProblemLink(problem.id)"
        >
          <div flex="~ items-center justify-between" mb-2>
            <span text="xs $bew-text-3" font-mono>
              {{ problem.id }}
            </span>
            <span
              text="xs"
              px-2
              py-1
              rounded-full
              fw-600
              :style="{
                color: difficultyColor(problem.difficulty),
                backgroundColor: `color-mix(in oklab, ${difficultyColor(problem.difficulty)}, transparent 85%)`,
              }"
            >
              {{ problem.difficulty }}
            </span>
          </div>

          <h3 text="sm $bew-text-1" fw-bold mb-2>
            {{ problem.title }}
          </h3>

          <div flex="~ gap-1 flex-wrap" mb-3>
            <span
              v-for="tag in problem.tags"
              :key="tag"
              text="xs $bew-text-2"
              px-2
              py-0.5
              rounded-full
              bg="$bew-fill-2"
            >
              {{ tag }}
            </span>
          </div>

          <div flex="~ items-center gap-1" text="xs $bew-text-3">
            <span v-html="renderIcon('mingcute:check-circle-line', 14)" style="display:contents" />
            <span>通过率 {{ problem.passRate }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.problem-card {
  backdrop-filter: var(--bew-filter-glass-1);
  transition: box-shadow 200ms ease, transform 200ms ease;

  &:hover {
    box-shadow: var(--bew-shadow-2) !important;
    transform: translateY(-2px);
  }
}
</style>
