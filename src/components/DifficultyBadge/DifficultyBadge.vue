<script setup lang="ts">
/**
 * 题目难度标签 —— 全站统一配色/文案的唯一出口(以题库页面为准,见 utils/difficulty.ts)。
 * 用法:<DifficultyBadge :difficulty="p.difficulty" />
 * 这是「题目难度」,不是咕值/用户名颜色/CCF 等级。
 */
import { diffColor, diffLabel } from '~/utils/difficulty'

const props = withDefaults(defineProps<{
  difficulty?: number
  /** size: sm=更小字号(紧凑列表行) */
  size?: 'sm' | 'md'
}>(), { difficulty: 0, size: 'md' })
</script>

<template>
  <span
    class="diff-badge" :class="`diff-${props.size}`"
    :style="{ background: `${diffColor(props.difficulty)}20`, color: diffColor(props.difficulty) }"
  >{{ diffLabel(props.difficulty) }}</span>
</template>

<style lang="scss" scoped>
.diff-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  font-weight: 600;
  line-height: 1.4;
}
.diff-md { font-size: 0.75rem; padding: 2px 10px; }
.diff-sm { font-size: 0.7em; padding: 1px 7px; }
</style>
