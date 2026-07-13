<script setup lang="ts">
import { renderIcon } from '~/utils/icons'

defineProps<{
  text?: string
}>()
</script>

<template>
  <div
    w="full" min-h="46px" p="y-12" flex="~ col" justify="center"
    items="center" gap-3
  >
    <div class="loading-spinner">
      <span style="display: contents" v-html="renderIcon('line-md:loading-twotone-loop', 28)" />
    </div>
    <Transition name="fade" mode="out-in">
      <span :key="text || 'default'" text="sm $bew-text-3" class="loading-text">{{ text || '加载中...' }}</span>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.loading-spinner {
  animation: loading-pulse 2s ease-in-out infinite;
  opacity: 0.7;
  :deep(svg) {
    width: 28px;
    height: 28px;
  }
}

@keyframes loading-pulse {
  0%,
  100% {
    opacity: 0.5;
    transform: scale(0.95);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

.loading-text {
  font-weight: 500;
  letter-spacing: 0.02em;
}
</style>
