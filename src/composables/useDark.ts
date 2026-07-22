import { usePreferredDark } from '@vueuse/core'

import { settings } from '~/logic'
import { runWhenIdle } from '~/utils/lazyLoad'

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

  // Add the 'dark' class to #guly and <html> so Unocss dark-specific styles apply.
  watch(
    () => [settings.value.themeMode, isPreferredDark.value],
    () => { setAppAppearance() },
    { immediate: true },
  )

  // Dispatch theme change once after idle to ensure shadow DOM is ready.
  runWhenIdle(() => {
    window.dispatchEvent(new CustomEvent('global.themeChange', { detail: isDark.value ? 'dark' : 'light' }))
  })

  function setAppAppearance() {
    if (isDark.value) {
      document.querySelector('#guly')?.classList.add('dark')
      document.documentElement.classList.add('dark')
      nextTick(() => { document.body?.classList.add('dark') })
      try { localStorage.setItem('gulugulu-dark', '1') } catch {}
      window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'dark' }))
    }
    else {
      document.querySelector('#guly')?.classList?.remove('dark')
      document.documentElement.classList.remove('dark')
      nextTick(() => { document.body?.classList.remove('dark') })
      try { localStorage.setItem('gulugulu-dark', '0') } catch {}
      window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'light' }))
    }
  }

  // Cycles auto -> explicit -> auto. 用 View Transition API 做扩散切换:
  // ::view-transition-new(root) 从点击点 clip-path 圆扩散,圆内=新主题、圆外=旧主题快照,
  // 两侧都是真实渲染内容(无需截图权限)。captureVisibleTab 因需 activeTab/<all_urls>
  // 权限被否决,改用此原生方案。非 100% 缩放下 VT 快照可能差几像素(可接受)。
  // clip-path 圆扩散需要关掉 VT 默认交叉淡入(旧层在下、新层在上)。该 CSS 只在【整数 dpr】
  // 下用 html.guly-vt-clip 类启用;分数 dpr 时不下发该类 → VT 走默认交叉淡入(见 toggleDark)。
  let vtStyle: HTMLStyleElement | null = null
  function ensureViewTransitionCss() {
    if (vtStyle)
      return
    vtStyle = document.createElement('style')
    vtStyle.textContent = 'html.guly-vt-clip ::view-transition-old(root),html.guly-vt-clip ::view-transition-new(root){animation:none!important;mix-blend-mode:normal}html.guly-vt-clip ::view-transition-old(root){z-index:1}html.guly-vt-clip ::view-transition-new(root){z-index:2}'
    document.head.appendChild(vtStyle)
  }
  function flipTheme() {
    if (currentAppColorScheme.value !== currentSystemColorScheme.value)
      settings.value.themeMode = 'auto'
    else
      settings.value.themeMode = isPreferredDark.value ? 'light' : 'dark'
  }
  async function toggleDark(e?: MouseEvent) {
    const x = e?.clientX ?? window.innerWidth / 2
    const y = e?.clientY ?? window.innerHeight / 2
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const d = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
    if (reduce || typeof d.startViewTransition !== 'function') {
      flipTheme()
      return
    }
    ensureViewTransitionCss()
    document.documentElement.classList.add('guly-vt-clip')
    // VT 回调内必须【同步】改变 DOM(否则 VT 捕获的新旧一致→无过渡)。
    // flipTheme 改 reactive setting,class 由 watch 异步施加,所以这里同步补一次 setAppAppearance。
    const t = d.startViewTransition(() => { flipTheme(); setAppAppearance() })
    t.ready.then(() => {
      // 调查分数 dpr 下圆心偏移:记录伪元素几何 + 点击坐标,据此精确补偿圆心(临时日志,修后删)。
      try {
        const dpr = window.devicePixelRatio || 1
        if (Math.abs(dpr - Math.round(dpr)) > 0.01) {
          const g = getComputedStyle(document.documentElement, '::view-transition-group(root)')
          const n = getComputedStyle(document.documentElement, '::view-transition-new(root)')
          console.debug('[guly-vt-offset]', JSON.stringify({ dpr, vw: innerWidth, vh: innerHeight, click: { x, y }, group: { top: g.top, left: g.left, w: g.width, h: g.height }, new: { top: n.top, left: n.left, w: n.width, h: n.height } }))
        }
      }
      catch {}
      const maxR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxR}px at ${x}px ${y}px)`] },
        { duration: 600, easing: 'cubic-bezier(0.33,0,0.67,1)', pseudoElement: '::view-transition-new(root)' },
      )
    }).catch(() => {})
  }

  return { isDark, toggleDark }
}
