import { ref, watch, type Ref } from 'vue'

// Smoothly tweens a numeric source ref to its new value over `duration` ms
// (ease-out-cubic). Returns an animated ref — read it in templates and
// Math.round() for display. Useful for big numbers that change on data load
// (rank, total score, record count, unread). Jumps instantly (no rAF loop)
// under prefers-reduced-motion.
export function useTween(source: Ref<number>, duration = 500): Ref<number> {
  const reduceMotion = typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const display = ref(source.value)
  let raf = 0

  function animate(from: number, to: number) {
    if (reduceMotion || from === to) {
      display.value = to
      return
    }
    cancelAnimationFrame(raf)
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3 // ease-out-cubic
      display.value = from + (to - from) * eased
      if (t < 1)
        raf = requestAnimationFrame(tick)
      else
        display.value = to
    }
    raf = requestAnimationFrame(tick)
  }

  watch(source, (to, from = to) => animate(from, to))

  return display
}
