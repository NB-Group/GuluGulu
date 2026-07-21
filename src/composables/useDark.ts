import { usePreferredDark } from '@vueuse/core'
import browser from 'webextension-polyfill'

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

  // Cycles auto -> explicit -> auto. The theme flips immediately (reactive);
  // we just dispatch the click coords so ThemeReveal can diffuse from the
  // pressed button (the overlay is purely visual).
  async function toggleDark(e?: MouseEvent) {
    if (e)
      window.dispatchEvent(new CustomEvent('global.themeRevealOrigin', { detail: { x: e.clientX, y: e.clientY } }))
    // 翻转前先截当前(旧主题)画面,ThemeReveal 用它做扩散圆外的真实旧内容覆盖层。
    // 必须在 flip 之前截,否则截到的是新主题。截图失败则回退到平涂色块覆盖。
    try {
      const res = await browser.runtime.sendMessage({ contentScriptQuery: 'CAPTURE_TAB' })
      if (res?.ok && typeof res.url === 'string')
        window.dispatchEvent(new CustomEvent('global.themeRevealSnapshot', { detail: res.url }))
    }
    catch {}
    if (currentAppColorScheme.value !== currentSystemColorScheme.value)
      settings.value.themeMode = 'auto'
    else
      settings.value.themeMode = isPreferredDark.value ? 'light' : 'dark'
  }

  return { isDark, toggleDark }
}
