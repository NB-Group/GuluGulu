<script setup lang="ts">
import { useDark } from '~/composables/useDark'

defineProps<{ activatedPage: string }>()
const { isDark } = useDark()
</script>

<template>
  <div
    :style="{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: -1,
      background: isDark
        ? 'linear-gradient(180deg, hsl(230 12% 8%) 0%, hsl(230 12% 4%) 100%)'
        : 'linear-gradient(180deg, hsl(240 31% 96%) 0%, hsl(0 0% 100%) 100%)',
    }"
  />
</template>
