import { usePreferredDark } from '@vueuse/core'

import { settings } from '~/logic'
import { runWhenIdle } from '~/utils/lazyLoad'
import { executeTimes } from '~/utils/timer'

let viewTransitionBaseInjected = false

// Inject the per-toggle VT styles. The click coordinates (x, y) and the
// reveal radius (r) are baked DIRECTLY into the @keyframes as literal pixel
// values — NOT passed via CSS custom properties. The view-transition pseudo-
// elements live in their own box tree; relying on `--var` inheritance from
// :root is fragile (if inheritance breaks, clip-path falls back to `50%` and
// the circle expands from screen center instead of the click point — which
// reads as an "offset" at every zoom level, including 100%). Literal coords
// guarantee the reveal origin matches the click exactly.
function ensureViewTransitionStyles(toDark: boolean, x: number, y: number, r: number) {
  if (typeof document === 'undefined')
    return

  // Remove previous dynamic VT style (regenerated each toggle with new coords)
  const prev = document.getElementById('gulugulu-vt-dynamic')
  if (prev)
    prev.remove()

  if (!viewTransitionBaseInjected) {
    viewTransitionBaseInjected = true
    const base = document.createElement('style')
    base.id = 'gulugulu-view-transition'
    // Default both snapshots to no animation; the dynamic style below opts
    // one of them into the clip animation.
    //
    // FRACTIONAL-DPR FIX: at non-integer devicePixelRatio (e.g. Windows DPI
    // scale 166% → dpr 1.6666), Chrome applies a `transform` with fractional
    // values to ::view-transition-group(root) to re-project the device-pixel
    // snapshot back into CSS pixels. That transform shifts/scales the ENTIRE
    // layer — including our clip-path circle — so the wipe origin lands well
    // off the click point even though the coords are correct. We animate via
    // clip-path on old/new, so the group transform is pure dead weight here:
    // neutralise it (and pin the snapshots to the viewport) to keep the
    // coordinate spaces of the click and the pseudo-element identical.
    base.textContent = `
      ::view-transition-group(root) {
        transform: none !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
      }
      ::view-transition-old(root), ::view-transition-new(root) {
        animation: none !important;
        mix-blend-mode: normal;
        overflow: clip;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
      }
    `
    document.head.appendChild(base)
  }

  const dyn = document.createElement('style')
  dyn.id = 'gulugulu-vt-dynamic'
  if (toDark) {
    // Light→Dark: the OLD (light) snapshot SHRINKS toward the click point,
    // revealing the NEW (dark) snapshot fixed underneath.
    dyn.textContent = `
      @keyframes gulu-clip-shrink {
        from { clip-path: circle(${r}px at ${x}px ${y}px); }
        to   { clip-path: circle(0px at ${x}px ${y}px); }
      }
      ::view-transition-old(root) {
        animation: gulu-clip-shrink 300ms ease-in-out both !important;
        z-index: 2147483646;
      }
      ::view-transition-new(root) { z-index: 1; }
    `
  }
  else {
    // Dark→Light: the NEW (light) snapshot EXPANDS from the click point,
    // covering the OLD (dark) snapshot fixed underneath.
    dyn.textContent = `
      @keyframes gulu-clip-expand {
        from { clip-path: circle(0px at ${x}px ${y}px); }
        to   { clip-path: circle(${r}px at ${x}px ${y}px); }
      }
      ::view-transition-new(root) {
        animation: gulu-clip-expand 300ms ease-in-out both !important;
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
      document.querySelector('#gulu')?.classList.add('dark')
      document.documentElement.classList.add('dark')
      nextTick(() => {
        document.body?.classList.add('dark')
      })
      // Cache for synchronous access in content script (prevents flash)
      try { localStorage.setItem('gulugulu-dark', '1') }
      catch {}
      window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'dark' }))
    }
    else {
      document.querySelector('#gulu')?.classList?.remove('dark')
      document.documentElement.classList.remove('dark')
      nextTick(() => {
        document.body?.classList.remove('dark')
      })
      try { localStorage.setItem('gulugulu-dark', '0') }
      catch {}
      window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'light' }))
    }
  }

  function toggleDark(e?: MouseEvent) {
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

      // Fall back to viewport center if invoked without a real click
      // (keyboard / programmatic toggle) so clientX/Y are never undefined.
      const clickX = e?.clientX ?? innerWidth / 2
      const clickY = e?.clientY ?? innerHeight / 2
      const endRadius = Math.hypot(
        Math.max(clickX, innerWidth - clickX),
        Math.max(clickY, innerHeight - clickY),
      )

      // FRACTIONAL-DPR COMPENSATION: Chrome resolves the clip-path reference
      // box of ::view-transition-old/new(root) against the snapshot's DEVICE-
      // pixel size, not the CSS viewport. So a circle at "35px 607px" lands
      // at (35/dpr, 607/dpr) visually — visibly up-and-left of the click at
      // any dpr > 1 (worst at fractional Windows scaling like 166%). Multiply
      // the coords and radius by devicePixelRatio to invert that scaling so
      // the wipe origin lands exactly on the click.
      const dpr = window.devicePixelRatio || 1
      // Chrome(及同源 Edge)在分数缩放下会把 ::view-transition-* 的 clip-path
      // 按设备像素解析,坐标需 ×dpr 补偿;但纯 Chromium 没这个 bug,clip-path 按
      // CSS px 解析,×dpr 反而过度补偿导致圆心偏右下。按浏览器品牌区分。
      // userAgentData.brands:Google Chrome/Edge 含 "Google Chrome";纯 Chromium 只有 "Chromium"。
      const brands: string[] = (navigator as any).userAgentData?.brands?.map((b: any) => b.brand) || []
      const isPlainChromium = brands.includes('Chromium') && !brands.includes('Google Chrome') && !brands.includes('Microsoft Edge')
      const f = isPlainChromium ? 1 : dpr
      const x = clickX * f
      const y = clickY * f
      const r = endRadius * f

      // Bake coords into the keyframes BEFORE starting the transition, so the
      // pseudo-elements pick up the literal values when they are created.
      ensureViewTransitionStyles(toDark, x, y, r)

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
        // guarantees `.dark` is on the main document's <html> (and #gulu)
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
