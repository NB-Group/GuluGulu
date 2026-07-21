<script setup lang="ts">
import { ref } from 'vue'
import { useDark } from '~/composables/useDark'

const { isDark } = useDark()
const revealing = ref(false)
const oldIsDark = ref(false)

const reduceMotion = typeof window !== 'undefined'
  && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// flush:'sync' so we observe the PREVIOUS isDark value before the `.dark` class
// flip reaches the DOM. The app underneath flips to the new theme (AppBackground
// swaps its gradient on the next tick); this overlay is painted with the OLD
// theme's gradient and retreats downward, revealing the new theme from the top.
//
// Pure CSS clip-path on a real DOM element — deliberately NOT the View Transition
// API. VT snapshots the page at device-pixel resolution and re-projects in CSS px,
// which rounds wrong at fractional zoom (110/125/150/166%) and visibly offsets the
// animated layer from the live content. A real element has no snapshot, so it is
// immune to that offset — this component IS the 166% fix.
watch(isDark, (_n, o) => {
  if (reduceMotion)
    return
  oldIsDark.value = o
  revealing.value = true
}, { flush: 'sync' })

function done() {
  revealing.value = false
}
</script>

<template>
  <div
    v-if="revealing"
    class="theme-reveal-overlay"
    :style="{ background: oldIsDark
      ? 'linear-gradient(180deg, hsl(230 12% 8%) 0%, hsl(230 12% 4%) 100%)'
      : 'linear-gradient(180deg, hsl(240 31% 96%) 0%, hsl(0 0% 100%) 100%)' }"
    @animationend="done"
  />
</template>

<style lang="scss" scoped>
.theme-reveal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  animation: theme-reveal-wipe 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes theme-reveal-wipe {
  from { clip-path: inset(0 0 0 0); } // fully covers (old theme)
  to { clip-path: inset(100% 0 0 0); } // retreats downward → new theme revealed from the top
}

@media (prefers-reduced-motion: reduce) {
  .theme-reveal-overlay {
    animation: none;
  }
}
</style>
