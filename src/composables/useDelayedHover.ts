import type { Ref } from 'vue'
import { ref } from 'vue'

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

  return target
}
