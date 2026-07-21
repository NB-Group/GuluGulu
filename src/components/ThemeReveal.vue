<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useDark } from '~/composables/useDark'

const { isDark } = useDark()
const revealing = ref(false)
const oldIsDark = ref(false)
const x = ref(0)
const y = ref(0)
const maxR = ref(0)

const reduceMotion = typeof window !== 'undefined'
  && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Capture the toggle click position (dispatched by useDark.toggleDark) so the
// diffusion expands from the button the user pressed. Defaults to viewport center.
function onOrigin(e: Event) {
  const d = (e as CustomEvent).detail as { x: number, y: number } | undefined
  if (d) {
    x.value = d.x
    y.value = d.y
  }
}
window.addEventListener('global.themeRevealOrigin', onOrigin as EventListener)
onUnmounted(() => window.removeEventListener('global.themeRevealOrigin', onOrigin as EventListener))

// On theme change: paint the OLD theme as an overlay, then grow a transparent
// hole at the click point via a CSS mask. The app underneath has already flipped
// to the NEW theme, so it shows through the hole — diffusing outward from the
// click. Real DOM + CSS mask, NOT the View Transition API: VT snapshots the page
// at device-pixel resolution and re-projects in CSS px, which rounds wrong at
// fractional zoom (110/125/150/166%) and offsets the layer — a real element has
// no snapshot, so it's immune. (This is the 166% fix.)
watch(isDark, (_n, o) => {
  if (reduceMotion)
    return
  oldIsDark.value = o
  const px = x.value || window.innerWidth / 2
  const py = y.value || window.innerHeight / 2
  x.value = px
  y.value = py
  // distance to the farthest corner (+5% overshoot so the corners fully clear)
  maxR.value = Math.hypot(Math.max(px, window.innerWidth - px), Math.max(py, window.innerHeight - py)) * 1.05
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
    :style="{
      background: oldIsDark
        ? 'linear-gradient(180deg, hsl(230 12% 8%) 0%, hsl(230 12% 4%) 100%)'
        : 'linear-gradient(180deg, hsl(240 31% 96%) 0%, hsl(0 0% 100%) 100%)',
      '--rx': `${x}px`,
      '--ry': `${y}px`,
      '--max-r': `${maxR}px`,
    }"
    @animationend="done"
  />
</template>

<style lang="scss" scoped>
// Registered custom property so the mask radius interpolates smoothly (a plain
// var would jump discretely at the end of the animation).
@property --r {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}

.theme-reveal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  --r: 0px;
  // transparent inside the growing circle (overlay hidden → NEW shows through),
  // black outside (overlay visible = OLD). 8% feather for a soft diffusion edge.
  mask: radial-gradient(circle var(--r) at var(--rx, 50%) var(--ry, 50%), transparent 92%, black);
  -webkit-mask: radial-gradient(circle var(--r) at var(--rx, 50%) var(--ry, 50%), transparent 92%, black);
  animation: theme-diffuse 0.85s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes theme-diffuse {
  from { --r: 0px; }
  to { --r: var(--max-r); }
}

@media (prefers-reduced-motion: reduce) {
  .theme-reveal-overlay {
    animation: none;
  }
}
</style>
