import { usePreferredDark } from '@vueuse/core'

import { settings } from '~/logic'
import { runWhenIdle } from '~/utils/lazyLoad'
import { executeTimes } from '~/utils/timer'

/**
 * Inject the persistent View Transition control styles into the MAIN document
 * (once). These target `::view-transition-*` pseudo-elements, which live in the
 * main document's top-layer — NOT inside our Shadow DOM. The copy that ships in
 * main.scss is injected into the Shadow DOM and therefore never applies.
 *
 * We suppress the browser's DEFAULT cross-fade animation on the root snapshots
 * (that cross-fade, running alongside our clip reveal, was one cause of the
 * flash). The actual clip-path reveal animation is added per-toggle by
 * `runClipReveal` below, as a plain CSS animation — which Firefox supports
 * reliably, unlike JS `Element.animate({ pseudoElement })`.
 */
let viewTransitionStyleInjected = false
function ensureViewTransitionStyles() {
  if (viewTransitionStyleInjected || typeof document === 'undefined')
    return
  viewTransitionStyleInjected = true

  const style = document.createElement('style')
  style.id = 'gulugulu-view-transition'
  style.textContent = `
    ::view-transition-old(root),
    ::view-transition-new(root) {
      animation: none;
      mix-blend-mode: normal;
    }
  `
  document.head.appendChild(style)
}

/**
 * Drive the circular clip-path reveal purely via CSS on the view-transition
 * pseudo-elements. Returns a promise that resolves when the animation ends.
 *
 * Why CSS instead of `document.documentElement.animate(..., { pseudoElement })`:
 *  - Firefox's support for JS-driven view-transition pseudo-element animation
 *    is fragile/late (see bug 1921112), so it silently did nothing there.
 *  - `animation-fill-mode: both` applies the 0% keyframe (`circle(0)`) at the
 *    moment the pseudo-elements are created, so the browser never paints a
 *    single unclipped "full-screen new theme" frame before the reveal starts —
 *    which was the residual first-frame flash in Chrome.
 */
function runClipReveal(x: number, y: number, endRadius: number): Promise<void> {
  const clipStart = `circle(0px at ${x}px ${y}px)`
  const clipEnd = `circle(${endRadius}px at ${x}px ${y}px)`

  // ALWAYS grow the NEW snapshot from a 0-radius circle to full screen, kept on
  // top. This is direction-independent (looks the same for dark→light and
  // light→dark) and, crucially, the END state is the new theme covering the
  // whole viewport at the top layer. So even if a browser (Firefox) tears the
  // pseudo-elements down a frame late, whatever shows through is the NEW theme —
  // never the old one flashing back. (Shrinking the OLD snapshot instead left a
  // window where Firefox re-revealed the old theme full-screen → the flash.)
  const animName = `guly-clip-${Date.now()}`
  const style = document.createElement('style')
  style.textContent = `
    ::view-transition-old(root) { z-index: 1; }
    ::view-transition-new(root) { z-index: 2147483646; }
    ::view-transition-new(root) {
      animation: ${animName} 300ms ease-in-out both;
    }
    @keyframes ${animName} {
      from { clip-path: ${clipStart}; }
      to { clip-path: ${clipEnd}; }
    }
  `
  document.head.appendChild(style)

  return new Promise<void>((resolve) => {
    // Resolve slightly after the animation duration; the pseudo-elements are
    // torn down by the browser when the transition finishes, so we just need to
    // clean up our injected style afterwards.
    setTimeout(() => {
      style.remove()
      resolve()
    }, 350)
  })
}

export function useDark() {
  const isPreferredDark = usePreferredDark()
  const currentSystemColorScheme = computed(() => isPreferredDark.value ? 'dark' : 'light')
  const currentAppColorScheme = computed((): 'dark' | 'light' => {
    if (settings.value.themeMode !== 'auto')
      return settings.value.themeMode
    else
      return currentSystemColorScheme.value
  })
  const isDark = computed(() => currentAppColorScheme.value === 'dark')
  let themeChangeTimer: NodeJS.Timeout | null = null

  // Watch for changes in the settings.value.themeMode variable and add the 'dark' class to the 'mainApp' element
  // to prevent some Unocss dark-specific styles from failing to take effect
  watch(
    () => [settings.value.themeMode, isPreferredDark.value],
    () => {
      setAppAppearance()
    },
    { immediate: true },
  )

  // use watchEffect instead of onMounted because onMounted is only available in setup function
  watchEffect(() => {
    // Because some shadow dom may not be loaded when the page has already loaded, we need to wait until the page is idle
    runWhenIdle(() => {
      if (isDark.value) {
        themeChangeTimer = executeTimes(() => {
          window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'dark' }))
        }, 10, 500)
      }
      else {
        themeChangeTimer = executeTimes(() => {
          window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'light' }))
        }, 10, 500)
      }
    })
  })

  /**
   * Watch for changes in the settings.value.themeMode variable and add the 'dark' class to the 'mainApp' element
   * to prevent some Unocss dark-specific styles from failing to take effect
   */
  function setAppAppearance() {
    if (themeChangeTimer)
      clearInterval(themeChangeTimer)

    if (isDark.value) {
      document.querySelector('#guly')?.classList.add('dark')
      document.documentElement.classList.add('dark')
      nextTick(() => {
        document.body?.classList.add('dark')
      })
      // Cache for synchronous access in content script (prevents flash)
      try { localStorage.setItem('gulugulu-dark', '1') } catch {}
      window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'dark' }))
    }
    else {
      document.querySelector('#guly')?.classList?.remove('dark')
      document.documentElement.classList.remove('dark')
      nextTick(() => {
        document.body?.classList.remove('dark')
      })
      try { localStorage.setItem('gulugulu-dark', '0') } catch {}
      window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'light' }))
    }
  }

  function toggleDark(e: MouseEvent) {
    const updateThemeSettings = () => {
      if (currentAppColorScheme.value !== currentSystemColorScheme.value)
        settings.value.themeMode = 'auto'
      else
        settings.value.themeMode = isPreferredDark.value ? 'light' : 'dark'
    }

    const isAppearanceTransition = typeof document !== 'undefined'
    // @ts-expect-error: Transition API
      && document.startViewTransition
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!isAppearanceTransition) {
      updateThemeSettings()
    }
    else {
      ensureViewTransitionStyles()

      const x = e.clientX
      const y = e.clientY
      const endRadius = Math.hypot(
        Math.max(x, innerWidth - x),
        Math.max(y, innerHeight - y),
      )
      // https://github.com/vueuse/vueuse/pull/3129
      const style = document.createElement('style')
      const styleString = `
            *, *::before, *::after
            {-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}`
      style.appendChild(document.createTextNode(styleString))
      document.head.appendChild(style)

      const transition: any = (document as any).startViewTransition(async () => {
        updateThemeSettings()
        // Apply the theme classes to the DOM synchronously here, instead of
        // relying on the async `watch` → `setAppAppearance` path. This
        // guarantees `.dark` is on the main document's <html> (and #guly)
        // BEFORE the browser captures the "new" snapshot — otherwise the
        // snapshot may capture the old theme, causing a random flash.
        setAppAppearance()
        // Then let Vue flush component updates (Shadow DOM content).
        await nextTick()
      })

      transition.ready
        .then(() => runClipReveal(x, y, endRadius))
        .catch(() => {})
        .finally(() => {
          style.remove()
        })
    }
  }

  return {
    isDark,
    toggleDark,
  }
}
