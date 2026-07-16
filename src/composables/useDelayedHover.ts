import type { Ref } from 'vue'
import { onScopeDispose, ref, watch } from 'vue'

export interface DelayedHoverOptions {
  enterDelay?: number
  leaveDelay?: number
  beforeEnter?: () => void
  enter?: () => void
  leave?: () => void
}

export function useDelayedHover(options: DelayedHoverOptions = {}): Ref<HTMLElement | undefined> {
  const target = ref<HTMLElement>()
  let enterTimer: ReturnType<typeof setTimeout> | undefined
  let leaveTimer: ReturnType<typeof setTimeout> | undefined

  function onMouseEnter() {
    clearTimeout(leaveTimer)
    options.beforeEnter?.()
    enterTimer = setTimeout(() => {
      options.enter?.()
    }, options.enterDelay ?? 0)
  }

  function onMouseLeave() {
    clearTimeout(enterTimer)
    leaveTimer = setTimeout(() => {
      options.leave?.()
    }, options.leaveDelay ?? 0)
  }

  // Bind handlers to whatever element the template ref resolves to.
  // flush:'post' runs after the DOM is patched so `target` is populated.
  watch(target, (el, _old, onCleanup) => {
    if (!el) return
    el.addEventListener('mouseenter', onMouseEnter)
    el.addEventListener('mouseleave', onMouseLeave)
    onCleanup(() => {
      el.removeEventListener('mouseenter', onMouseEnter)
      el.removeEventListener('mouseleave', onMouseLeave)
    })
  }, { flush: 'post' })

  onScopeDispose(() => {
    clearTimeout(enterTimer)
    clearTimeout(leaveTimer)
  })

  return target
}
