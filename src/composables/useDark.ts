import { usePreferredDark } from '@vueuse/core'

import { settings } from '~/logic'
import { runWhenIdle } from '~/utils/lazyLoad'

let viewTransitionStyleInjected = false
function ensureViewTransitionStyles(toDark: boolean) {
  if (typeof document === 'undefined') return

  // Remove previous dynamic VT style (direction changes each toggle)
  const prev = document.getElementById('gulugulu-vt-dynamic')
  if (prev) prev.remove()

  if (!viewTransitionStyleInjected) {
    viewTransitionStyleInjected = true
    const base = document.createElement('style')
    base.id = 'gulugulu-view-transition'
    base.textContent = `
      @keyframes guly-clip-expand {
        from { clip-path: circle(0px at var(--guly-clip-x, 50%) var(--guly-clip-y, 50%)); }
        to   { clip-path: circle(var(--guly-clip-r, 100vmax) at var(--guly-clip-x, 50%) var(--guly-clip-y, 50%)); }
      }
      @keyframes guly-clip-shrink {
        from { clip-path: circle(var(--guly-clip-r, 100vmax) at var(--guly-clip-x, 50%) var(--guly-clip-y, 50%)); }
        to   { clip-path: circle(0px at var(--guly-clip-x, 50%) var(--guly-clip-y, 50%)); }
      }
      ::view-transition-old(root), ::view-transition-new(root) {
        animation: none !important;
        mix-blend-mode: normal;
      }
    `
    document.head.appendChild(base)
  }

  // Direction-specific: inject per-toggle so selectors apply correctly
  const dyn = document.createElement('style')
  dyn.id = 'gulugulu-vt-dynamic'
  if (toDark) {
    // Light→Dark: old-light-snapshot SHRINKS toward click, revealing dark underneath
    dyn.textContent = `
      ::view-transition-old(root) {
        animation: guly-clip-shrink 300ms ease-in-out both !important;
        z-index: 2147483646;
      }
      ::view-transition-new(root) { z-index: 1; }
    `
  } else {
    // Dark→Light: new-light-snapshot EXPANDS from click, covering dark
    dyn.textContent = `
      ::view-transition-new(root) {
        animation: guly-clip-expand 300ms ease-in-out both !important;
        z-index: 2147483646;
      }
      ::view-transition-old(root) { z-index: 1; }
    `
  }
  document.head.appendChild(dyn)
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

  // Watch for changes in the settings.value.themeMode variable and add the 'dark' class to the 'mainApp' element
  // to prevent some Unocss dark-specific styles from failing to take effect
  watch(
    () => [settings.value.themeMode, isPreferredDark.value],
    () => {
      setAppAppearance()
    },
    { immediate: true },
  )

  // Dispatch theme change once after idle to ensure shadow DOM is ready.
  // Was using watchEffect + executeTimes (10x500ms) which caused render loops.
  runWhenIdle(() => {
    window.dispatchEvent(new CustomEvent('global.themeChange', { detail: isDark.value ? 'dark' : 'light' }))
  })

  /**
   * Watch for changes in the settings.value.themeMode variable and add the 'dark' class to the 'mainApp' element
   * to prevent some Unocss dark-specific styles from failing to take effect
   */
  function setAppAppearance() {
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

  let transitioning = false

  function toggleDark(e: MouseEvent) {
    // Prevent double-click during View Transition animation (avoids theme oscillation)
    if (transitioning) return
    transitioning = true
    setTimeout(() => { transitioning = false }, 500)

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
      const toDark = currentAppColorScheme.value === 'light'
      ensureViewTransitionStyles(toDark)

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

      // Set the click-position variables BEFORE starting the transition, so they
      // are already in place when the pseudo-elements (and their animation) are
      // created — otherwise the reveal falls back to a centred circle.
      const root = document.documentElement
      root.style.setProperty('--guly-clip-x', `${x}px`)
      root.style.setProperty('--guly-clip-y', `${y}px`)
      root.style.setProperty('--guly-clip-r', `${endRadius}px`)

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
        .catch(() => {})
        .finally(() => {
          // Keep the transition-suppression style alive for the reveal duration.
          setTimeout(() => style.remove(), 350)
        })
    }
  }

  return {
    isDark,
    toggleDark,
  }
}
