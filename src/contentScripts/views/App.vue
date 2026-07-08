<script setup lang="ts">
import { useEventListener, useThrottleFn, useToggle } from '@vueuse/core'
import type { Ref } from 'vue'

import type { GulyAppProvider } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { GULY_MOUNTED, OVERLAY_SCROLL_BAR_SCROLL } from '~/constants/globalEvents'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { useMainStore } from '~/stores/mainStore'
import { isHomePage, isInIframe, openLinkToNewTab, scrollToTop } from '~/utils/main'
import emitter from '~/utils/mitt'

const mainStore = useMainStore()
const { isDark } = useDark()
const [showSettings, toggleSettings] = useToggle(false)

// Get the 'page' query parameter from the URL
function getPageParam(): AppPage | null {
  const urlParams = new URLSearchParams(window.location.search)
  const result = urlParams.get('page') as AppPage | null
  if (result && Object.values(AppPage).includes(result))
    return result
  return null
}

// Detect which page to show based on the current URL
function getPageFromUrl(): AppPage {
  const url = document.URL

  if (/\/problem\/list/i.test(url)) return AppPage.ProblemList
  if (/\/problem\/[A-Z]?\d+/i.test(url)) return AppPage.ProblemDetail
  if (/\/contest\/list/i.test(url)) return AppPage.ContestList
  if (/\/contest\/\d+/i.test(url)) return AppPage.ContestDetail
  if (/\/ranking/i.test(url)) return AppPage.Ranking
  if (/\/blog\//i.test(url) || /\/discuss\//i.test(url)) return AppPage.Blog
  if (/\/user\//i.test(url)) return AppPage.UserProfile
  if (/\/training\/list/i.test(url)) return AppPage.Training
  if (/\/training\/\d+/i.test(url)) return AppPage.Training
  if (/\/team\//i.test(url)) return AppPage.Team
  if (/\/record\//i.test(url)) return AppPage.Record
  if (/\/chat/i.test(url) && !/\/discuss/i.test(url)) return AppPage.Messages
  if (/\/search/i.test(url) || /\/problem\/keyword/i.test(url)) return AppPage.Search

  return AppPage.Home
}

const activatedPage = ref<AppPage>(
  getPageParam()
  || getPageFromUrl()
  || (settings.value.dockItemsConfig.find(e => e.visible === true)?.page || AppPage.Home)
)

const pages = {
  [AppPage.Home]: defineAsyncComponent(() => import('./Home/Home.vue')),
  [AppPage.ProblemList]: defineAsyncComponent(() => import('./ProblemList/ProblemList.vue')),
  [AppPage.ProblemDetail]: defineAsyncComponent(() => import('./ProblemDetail/ProblemDetail.vue')),
  [AppPage.ContestList]: defineAsyncComponent(() => import('./ContestList/ContestList.vue')),
  [AppPage.ContestDetail]: defineAsyncComponent(() => import('./ContestDetail/ContestDetail.vue')),
  [AppPage.Ranking]: defineAsyncComponent(() => import('./Ranking/Ranking.vue')),
  [AppPage.Blog]: defineAsyncComponent(() => import('./Blog/Blog.vue')),
  [AppPage.UserProfile]: defineAsyncComponent(() => import('./UserProfile/UserProfile.vue')),
  [AppPage.Search]: defineAsyncComponent(() => import('./Search/Search.vue')),
  [AppPage.Training]: defineAsyncComponent(() => import('./Training/Training.vue')),
  [AppPage.Team]: defineAsyncComponent(() => import('./Team/Team.vue')),
  [AppPage.Record]: defineAsyncComponent(() => import('./Record/Record.vue')),
  [AppPage.Login]: defineAsyncComponent(() => import('./Login/Login.vue')),
  [AppPage.Messages]: defineAsyncComponent(() => import('./Messages/Messages.vue')),
}

const mainAppRef = ref<HTMLElement>() as Ref<HTMLElement>
const scrollbarRef = ref()
const handlePageRefresh = ref<() => void>()
const handleReachBottom = ref<() => void>()
const handleThrottledPageRefresh = useThrottleFn(() => handlePageRefresh.value?.(), 500)
const handleThrottledReachBottom = useThrottleFn(() => handleReachBottom.value?.(), 500)
const handleThrottledBackToTop = useThrottleFn(() => handleBackToTop(), 1000)
const topBarRef = ref()
const reachTop = ref<boolean>(true)

const showGulyPage = computed((): boolean => {
  if (isInIframe())
    return false
  // Show GulyGuly full UI on all supported Luogu pages
  const url = document.URL
  return /https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?/.test(url)
    || /https?:\/\/(?:www\.)?luogu\.org/.test(url)
})

const showTopBar = computed((): boolean => {
  if (isInIframe() && isHomePage())
    return false
  return settings.value.showTopBar
})

watch(
  () => activatedPage.value,
  () => {
    if (scrollbarRef.value?.osInstance) {
      const osInstance = scrollbarRef.value.osInstance()
      if (osInstance?.elements)
        osInstance.elements().viewport.scrollTop = 0
    }
  },
)

// Apply theme color CSS variables to the shadow root
function applyThemeColor() {
  const el = document.getElementById('guly')
  if (!el) return
  const color = settings.value.themeColor
  el.style.setProperty('--bew-theme-color', color)
  // Generate opacity variants using color-mix
  for (let i = 10; i <= 90; i += 10) {
    el.style.setProperty(`--bew-theme-color-${i}`, `color-mix(in oklab, ${color}, transparent ${100 - i}%)`)
  }
}

watch(() => settings.value.themeColor, applyThemeColor, { immediate: true })

// Apply base font size
watch(() => settings.value.baseFontSize, (size) => {
  const el = document.getElementById('guly')
  if (el) el.style.setProperty('--bew-base-font-size', `${size}px`)
}, { immediate: true })

// Apply page max width
watch(() => settings.value.pageMaxWidth, (width) => {
  const el = document.getElementById('guly')
  if (el) el.style.setProperty('--bew-page-max-width', `${width}px`)
}, { immediate: true })

// Apply frosted glass CSS classes to document root
function applyFrostedGlassClasses() {
  const root = document.documentElement
  root.classList.toggle('disable-frosted-glass', settings.value.disableFrostedGlass)
  root.classList.toggle('reduce-frosted-glass-blur', !settings.value.disableFrostedGlass && settings.value.reduceFrostedGlassBlur)
}
watch(() => [settings.value.disableFrostedGlass, settings.value.reduceFrostedGlassBlur], applyFrostedGlassClasses, { immediate: true })

// Listen to Luogu's own SPA navigation (hooked by inject/index.js)
function onHistoryChange() {
  const url = window.location.href
  if (url !== currentUrl.value) {
    currentUrl.value = url
    const page = getPageFromUrl()
    if (page !== activatedPage.value) {
      activatedPage.value = page
    }
  }
}
window.addEventListener('historyChange', onHistoryChange)
// Handle browser back/forward buttons
function onPopState() {
  currentUrl.value = window.location.href
  const page = getPageFromUrl()
  if (page !== activatedPage.value) {
    activatedPage.value = page
  }
}
window.addEventListener('popstate', onPopState)

onMounted(() => {
  window.dispatchEvent(new CustomEvent(GULY_MOUNTED))
  // Only normalize URL for list pages (not detail pages with IDs)
  const detailPages = [AppPage.ProblemDetail, AppPage.Blog, AppPage.Record, AppPage.ContestDetail, AppPage.Training, AppPage.UserProfile]
  if (!detailPages.includes(activatedPage.value)) {
    const url = mainStore.getLuoguWebPageURLByPage(activatedPage.value)
    if (url && url !== window.location.href) {
      history.replaceState({ page: activatedPage.value }, '', url)
      currentUrl.value = url
    }
  }

  // Unset the body background so our AppBackground shows through
  document.body.style.setProperty('background-color', 'unset', 'important')

  document.addEventListener('scroll', () => {
    if (window.scrollY > 0)
      reachTop.value = false
    else
      reachTop.value = true
  })
})

const currentUrl = ref(window.location.href)

function navigateTo(pageName: AppPage, url?: string) {
  const osInstance = scrollbarRef.value?.osInstance?.()
  const scrollTopValue: number = osInstance?.elements?.().viewport?.scrollTop || 0

  // Update URL even for same-page navigation (e.g. list→detail)
  const targetUrl = url || mainStore.getLuoguWebPageURLByPage(pageName)
  if (targetUrl && targetUrl !== window.location.href) {
    history.pushState({ page: pageName }, '', targetUrl)
    currentUrl.value = targetUrl
  }

  if (activatedPage.value === pageName) {
    if (activatedPage.value !== AppPage.Search) {
      if (scrollTopValue === 0)
        handleThrottledPageRefresh()
      else
        handleThrottledBackToTop()
    }
    return
  }
  activatedPage.value = pageName
}

function handleBackToTop(targetScrollTop = 0 as number) {
  const osInstance = scrollbarRef.value?.osInstance?.()
  if (osInstance) {
    scrollToTop(osInstance.elements().viewport, targetScrollTop)
    topBarRef.value?.toggleTopBarVisible(true)
  }
}

function handleOsScroll() {
  emitter.emit(OVERLAY_SCROLL_BAR_SCROLL)

  const osInstance = scrollbarRef.value?.osInstance?.()
  if (!osInstance?.elements) return
  const { viewport } = osInstance.elements()
  const { scrollTop, scrollHeight, clientHeight } = viewport

  if (scrollTop === 0) {
    reachTop.value = true
  }
  else {
    reachTop.value = false
  }

  if (clientHeight + scrollTop >= scrollHeight - 300)
    handleThrottledReachBottom()

  if (isHomePage())
    topBarRef.value?.handleScroll()
}

function openSettings() {
  toggleSettings()
}

/**
 * Checks if the current viewport has a scrollbar.
 */
async function haveScrollbar() {
  await nextTick()
  const osInstance = scrollbarRef.value?.osInstance?.()
  if (osInstance?.elements) {
    const { viewport } = osInstance.elements()
    const { scrollHeight } = viewport
    return scrollHeight > window.innerHeight
  }
  else {
    return false
  }
}

function openIframeDrawer(url: string) {
  openLinkToNewTab(url)
}

provide<GulyAppProvider>('GULY_APP', {
  activatedPage,
  currentUrl,
  mainAppRef,
  scrollbarRef,
  reachTop,
  handleBackToTop,
  handlePageRefresh,
  handleReachBottom,
  openIframeDrawer,
  haveScrollbar,
  openSettings,
  navigateTo,
})
</script>

<template>
  <div
    id="guly-wrapper"
    ref="mainAppRef"
    class="guly-wrapper"
    :class="{ dark: isDark }"
    text="$bew-text-1 size-$bew-base-font-size"
  >
    <!-- Background -->
    <template v-if="showGulyPage">
      <AppBackground :activated-page="activatedPage" />
    </template>

    <!-- Settings -->
    <KeepAlive>
      <Settings v-if="showSettings" z-10002 @close="showSettings = false" />
    </KeepAlive>

    <!-- Dock -->
    <div
      v-if="!isInIframe()"
      pos="absolute top-0 left-0" w-full h-full overflow-hidden
      pointer-events-none
    >
      <Dock
        v-if="settings.alwaysUseDock && settings.dockItemsConfig.length > 0"
        pointer-events-auto
        :activated-page="activatedPage"
        @settings-visibility-change="toggleSettings"
        @refresh="handleThrottledPageRefresh"
        @back-to-top="handleThrottledBackToTop"
        @dock-item-click="(dockItem) => navigateTo(dockItem.page, dockItem.url)"
      />
    </div>

    <!-- TopBar -->
    <div
      v-if="showTopBar"
      m-auto max-w="$bew-page-max-width"
    >
      <TopBar
        ref="topBarRef"
        pos="top-0 left-0" z="99 hover:1001" w-full
      />
    </div>

    <div
      pos="absolute top-0 left-0" w-full h-full
      :style="{
        height: showGulyPage ? '100dvh' : '0',
      }"
    >
      <Transition name="fade">
        <template v-if="showGulyPage">
          <OverlayScrollbarsComponent ref="scrollbarRef" element="div" h-inherit defer @os-scroll="handleOsScroll">
            <main m-auto max-w="$bew-page-max-width">
              <div
                p="t-[calc(var(--bew-top-bar-height)+10px)]" m-auto
                w="lg:[calc(100%-200px)] [calc(100%-150px)]"
              >
                <Transition name="page-fade" mode="out-in">
                  <Component :is="pages[activatedPage]" :key="activatedPage" />
                </Transition>
              </div>
            </main>
          </OverlayScrollbarsComponent>
        </template>
      </Transition>
    </div>

  </div>
</template>

<style lang="scss" scoped>
</style>
