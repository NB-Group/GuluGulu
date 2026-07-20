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

  // Instant toggle - no animation. Cycles auto -> explicit -> auto.
  function toggleDark(_e?: MouseEvent) {
    if (currentAppColorScheme.value !== currentSystemColorScheme.value)
      settings.value.themeMode = 'auto'
    else
      settings.value.themeMode = isPreferredDark.value ? 'light' : 'dark'
  }

  return { isDark, toggleDark }
}
