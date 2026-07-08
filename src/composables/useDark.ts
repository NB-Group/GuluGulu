import { usePreferredDark } from '@vueuse/core'

import { settings } from '~/logic'
import { runWhenIdle } from '~/utils/lazyLoad'
import { executeTimes } from '~/utils/timer'

/**
 * Inject the View Transition control styles into the MAIN document (once).
 *
 * These rules target `::view-transition-*` pseudo-elements, which live in the
 * main document's top-layer — NOT inside our Shadow DOM. The copy that ships in
 * main.scss is injected into the Shadow DOM and therefore never applies, which
 * left the browser's default cross-fade running alongside our clip-path
 * animation and produced a one-frame "flash" at the end of the transition.
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
      animation: none !important;
      mix-blend-mode: normal;
      transition: none !important;
    }
    ::view-transition-old(root) { z-index: 1; }
    ::view-transition-new(root) { z-index: 2147483646; }
    .dark::view-transition-old(root) { z-index: 2147483646; }
    .dark::view-transition-new(root) { z-index: 1; }
  `
  document.head.appendChild(style)
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

      // Since the above normal dom style cannot be applied in shadow dom style
      // We need to add this style again to the shadow dom
      const shadowDomStyle = document.createElement('style')
      const shadowDomStyleString = `
            *, *::before, *::after
            {-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important; will-change: background}`
      shadowDomStyle.appendChild(document.createTextNode(shadowDomStyleString))

      const gulyShadowRoot = document.getElementById('guly')?.shadowRoot
      const gulyWrapper = gulyShadowRoot?.getElementById('guly-wrapper')
      if (!gulyWrapper)
        throw new Error('mainAppRef is not found')

      gulyWrapper.appendChild(shadowDomStyle)

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

      transition.ready.then(() => {
        const clipPath = [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
        ]
        const animation = document.documentElement.animate(
          {
            clipPath: currentAppColorScheme.value === 'dark'
              ? [...clipPath].reverse()
              : clipPath,
          },
          {
            duration: 300,
            easing: 'ease-in-out',
            // Keep the final clip-path after the animation ends. Without this the
            // clip-path snaps back to its default (unclipped) value for one frame,
            // re-revealing the old snapshot full-screen → the "flash" bug.
            fill: 'forwards',
            pseudoElement: currentAppColorScheme.value === 'dark'
              ? '::view-transition-old(root)'
              : '::view-transition-new(root)',
          },
        )
        animation.addEventListener('finish', () => {
          document.head.removeChild(style!)
          gulyWrapper.removeChild(shadowDomStyle!)
        }, { once: true })
      })
    }
  }

  return {
    isDark,
    toggleDark,
  }
}
