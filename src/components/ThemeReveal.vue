<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useDark } from '~/composables/useDark'

const { isDark } = useDark()
const revealing = ref(false)
const oldIsDark = ref(false)
const x = ref(0)
const y = ref(0)
const maxR = ref(0)
// 截到的旧主题画面(captureVisibleTab PNG)。圆外显示这张真实旧内容;
// 为空(截图失败)时回退到下面的平涂渐变色。
const snapshotUrl = ref('')

const reduceMotion = typeof window !== 'undefined'
  && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Capture the toggle click position (dispatched by useDark.toggleDark) so the
// diffusion expands from the button the user pressed. Defaults to viewport center.
// Also resets any stale snapshot so a failed capture falls back to the flat color.
function onOrigin(e: Event) {
  const d = (e as CustomEvent).detail as { x: number, y: number } | undefined
  if (d) {
    x.value = d.x
    y.value = d.y
  }
  snapshotUrl.value = ''
}
// useDark.toggleDark 截完旧主题画面后 dispatch 这个事件(detail = PNG dataURL)。
// 它在主题翻转之前到达,所以 watch(isDark) 触发时 snapshotUrl 已就绪。
function onSnapshot(e: Event) {
  const d = (e as CustomEvent).detail
  if (typeof d === 'string')
    snapshotUrl.value = d
}
window.addEventListener('global.themeRevealOrigin', onOrigin as EventListener)
window.addEventListener('global.themeRevealSnapshot', onSnapshot as EventListener)
onUnmounted(() => {
  window.removeEventListener('global.themeRevealOrigin', onOrigin as EventListener)
  window.removeEventListener('global.themeRevealSnapshot', onSnapshot as EventListener)
})

// On theme change: paint the OLD theme as an overlay, then grow a transparent
// hole at the click point via a CSS mask. The app underneath has already flipped
// to the NEW theme, so it shows through the hole — diffusing outward from the
// click. Real DOM + CSS mask, NOT the View Transition API: VT snapshots the page
// at device-pixel resolution and re-projects in CSS px, which rounds wrong at
// fractional zoom (110/125/150/166%) and offsets the layer — a real element has
// no snapshot, so it's immune. (This is the 166% fix.)
watch(isDark, (_n, o) => {
  // View Transition API 可用时由 useDark 的 VT 扩散接管,这里只作无 VT 浏览器的回退。
  if (reduceMotion || typeof (document as any).startViewTransition === 'function')
    return
  oldIsDark.value = o
  const px = x.value || window.innerWidth / 2
  const py = y.value || window.innerHeight / 2
  x.value = px
  y.value = py
  // distance to the farthest corner (+5% overshoot so the corners fully clear)
  maxR.value = Math.hypot(Math.max(px, window.innerWidth - px), Math.max(py, window.innerHeight - py)) * 1.2
  revealing.value = true
}, { flush: 'sync' })

function done() {
  revealing.value = false
  snapshotUrl.value = '' // 释放大 dataURL,避免常驻内存
}
</script>

<template>
  <div
    v-if="revealing"
    class="theme-reveal-overlay"
    :style="{
      backgroundImage: snapshotUrl
        ? `url(${snapshotUrl})`
        : (oldIsDark
          ? 'linear-gradient(180deg, hsl(230 12% 8%) 0%, hsl(230 12% 4%) 100%)'
          : 'linear-gradient(180deg, hsl(240 31% 96%) 0%, hsl(0 0% 100%) 100%)'),
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
  opacity: 1; // 不透明:圆外=旧主题(原色),圆孔内露出新主题,扩散把旧色替换成新色
  background-size: 100% 100%; // 截图铺满视口,与底层实时画面像素对齐
  background-position: center;
  background-repeat: no-repeat;
  --r: 0px;
  // transparent inside the growing circle (overlay hidden → NEW theme shows),
  // black outside (overlay fully opaque = OLD theme covers page). As --r grows,
  // the new-theme hole expands outward, replacing old with new — one diffusion.
  mask: radial-gradient(circle var(--r) at var(--rx, 50%) var(--ry, 50%), transparent 97%, black);
  -webkit-mask: radial-gradient(circle var(--r) at var(--rx, 50%) var(--ry, 50%), transparent 97%, black);
  animation: theme-diffuse 0.9s cubic-bezier(0.33, 0, 0.67, 1) forwards;
}

@keyframes theme-diffuse {
  0%   { --r: 0px; }
  85%  { --r: var(--max-r); } // fully spread — circle covers viewport (+20% overshoot)
  100% { --r: var(--max-r); } // hold, then element unmounts (already invisible)
}

@media (prefers-reduced-motion: reduce) {
  .theme-reveal-overlay {
    animation: none;
  }
}
</style>
