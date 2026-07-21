<script setup lang="ts">
import { useThrottleFn } from '@vueuse/core'

import Sidebar from './components/Sidebar.vue'
import { useGulyApp } from '~/composables/useAppProvider'
import { HomeSubPage } from '~/enums/appEnums'
import type { HomeTab } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'

const mainStore = useMainStore()
const { handleBackToTop, scrollbarRef } = useGulyApp()
const handleThrottledBackToTop = useThrottleFn((targetScrollTop: number = 0) => handleBackToTop(targetScrollTop), 1000)

// Fetch Luogu homepage banner image
const bannerUrl = ref('')
onMounted(async () => {
  try {
    const res = await fetch('https://www.luogu.com.cn/', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<img[^>]+src="(https:\/\/ipic\.luogu\.com\.cn\/[^"]*(?:banner|Banner|hero)[^"]*)"/)
    if (m) bannerUrl.value = m[1]
  } catch (e) { console.warn('[GuluGulu]', e) }
})

const activatedPage = ref<HomeSubPage>(HomeSubPage.Trending)
const pages = {
  [HomeSubPage.Trending]: defineAsyncComponent(() => import('./components/Trending.vue')),
  [HomeSubPage.RecentContests]: defineAsyncComponent(() => import('./components/RecentContests.vue')),
  [HomeSubPage.HotProblems]: defineAsyncComponent(() => import('./components/HotProblems.vue')),
  [HomeSubPage.RecentDiscussions]: defineAsyncComponent(() => import('./components/RecentDiscussions.vue')),
}

const tabContentLoading = ref<boolean>(false)
const currentTabs = ref<HomeTab[]>([])
const tabPageRef = ref()

function computeTabs(): HomeTab[] {
  return mainStore.homeTabs.map(tab => ({
    i18nKey: tab.i18nKey,
    page: tab.page,
  }))
}

onMounted(() => {
  currentTabs.value = computeTabs()
  activatedPage.value = currentTabs.value[0]?.page || HomeSubPage.Trending
})

function handleChangeTab(tab: HomeTab) {
  if (activatedPage.value === tab.page) {
    const osInstance = scrollbarRef.value?.osInstance?.()
    if (!osInstance?.elements) {
      // scrollbar not ready yet, ignore
      tabPageRef.value?.initData?.()
      return
    }
    const scrollTop = (osInstance.elements().viewport?.scrollTop as number) || 0

    if (scrollTop > 0) {
      handleThrottledBackToTop(0)
    }
    else {
      if (tabContentLoading.value)
        return
      tabPageRef.value?.initData?.()
    }
    return
  }
  else {
    handleThrottledBackToTop(0)
  }

  if (tabContentLoading.value)
    toggleTabContentLoading(false)

  activatedPage.value = tab.page
}

function toggleTabContentLoading(loading: boolean) {
  tabContentLoading.value = loading
}
</script>

<template>
  <div>
    <main>
      <!-- Banner -->
      <div v-if="bannerUrl" mb-4 rounded="$bew-radius" overflow-hidden shadow="[var(--bew-shadow-1)]">
        <img :src="bannerUrl" w-full style="max-height:200px;object-fit:cover;display:block" alt="banner" />
      </div>

      <header class="home-header">
        <section v-if="currentTabs.length > 1" class="tab-bar">
          <div class="tab-scroll">
            <button
              v-for="tab in currentTabs" :key="tab.page"
              :class="['tab-btn', { 'tab-btn--active': activatedPage === tab.page }]"
              @click="handleChangeTab(tab)"
            >
              {{ $t(tab.i18nKey) }}
            </button>
          </div>
        </section>
      </header>

      <!-- Content area: main + sidebar -->
      <div flex="~ row wrap" gap-4>
        <div flex="1" min-w-0>
          <Transition name="page-switch" mode="out-in">
            <Component
              :is="pages[activatedPage]" :key="activatedPage"
              ref="tabPageRef"
              @before-loading="toggleTabContentLoading(true)"
              @after-loading="toggleTabContentLoading(false)"
            />
          </Transition>
        </div>
        <div class="home-sidebar" w="280px" flex-shrink-0 display="none md:block">
          <Sidebar />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home-header {
  position: sticky;
  top: calc(var(--bew-top-bar-height) + 10px);
  width: 100%;
  z-index: 9;
  margin-bottom: 16px;
}

.tab-bar {
  background: var(--bew-elevated);
  backdrop-filter: var(--bew-filter-glass-1);
  border-radius: 9999px;
  border: 1px solid var(--bew-border-color);
  box-shadow: var(--bew-shadow-1), var(--bew-shadow-edge-glow-1);
  padding: 4px;
  width: 100%;
  height: 38px;
  box-sizing: border-box;
}

.tab-scroll {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}
.tab-scroll::-webkit-scrollbar { display: none; }

.tab-btn {
  padding: 0 12px;
  height: 100%;
  background: transparent;
  color: var(--bew-text-2);
  font-weight: 700;
  font-size: var(--bew-base-font-size);
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--bew-dur-normal, 0.3s) ease, color var(--bew-dur-normal, 0.3s) ease, transform var(--bew-dur-normal, 0.3s) ease, box-shadow var(--bew-dur-normal, 0.3s) ease;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.tab-btn:hover {
  background: var(--bew-fill-2);
  color: var(--bew-text-1);
}
.tab-btn--active {
  background: var(--bew-theme-color);
  color: #fff;
  transform: translateY(-1px);
  box-shadow: var(--bew-active-glow, 0 4px 12px rgba(0, 0, 0, 0.08));
}
</style>
