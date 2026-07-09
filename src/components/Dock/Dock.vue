<script setup lang="ts">
import { useElementSize, useWindowSize } from '@vueuse/core'
import { computed, reactive, ref } from 'vue'

import { renderIcon } from '~/utils/icons'
import { useGulyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { useMessagePolling } from '~/composables/useMessagePolling'
import { useDelayedHover } from '~/composables/useDelayedHover'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'

import type { HoveringDockItem } from './types'

const props = defineProps<{
  activatedPage: AppPage
}>()

const emit = defineEmits<{
  (e: 'dockItemClick', dockItem: DockItem): void
  (e: 'dockItemMiddleClick', dockItem: DockItem): void
  (e: 'settingsVisibilityChange'): void
  (e: 'refresh'): void
  (e: 'backToTop'): void
}>()

const mainStore = useMainStore()
const { isDark, toggleDark } = useDark()
const { unreadMsgCount } = useMessagePolling()
const { reachTop } = useGulyApp()

const hideDock = ref<boolean>(false)
const dockContentHover = ref<boolean>(false)
const dockContentRef = useDelayedHover({
  enterDelay: 100,
  leaveDelay: 600,
  enter: () => {
    dockContentHover.value = true
    toggleHideDock(false)
  },
  leave: () => {
    dockContentHover.value = false
    toggleHideDock(true)
  },
})

const hoveringDockItem = reactive<HoveringDockItem>({
  themeMode: false,
  settings: false,
})
const currentDockItems = ref<DockItem[]>([])
const activatedDockItem = ref<DockItem>()

const tooltipPlacement = computed(() => {
  if (settings.dockPosition === 'left')
    return 'right'
  else if (settings.dockPosition === 'right')
    return 'left'
  else if (settings.dockPosition === 'bottom')
    return 'top'
  return 'right'
})

const showBackToTopOrRefreshButton = computed((): boolean => {
  return props.activatedPage !== AppPage.Search
})

watch(() => settings.autoHideDock, (newValue) => {
  hideDock.value = newValue
}, { immediate: true })

watch(() => JSON.stringify(settings.dockItemsConfig), () => {
  currentDockItems.value = computeDockItem()
}, { immediate: true })

function computeDockItem(): DockItem[] {
  if (Array.isArray(settings.dockItemsConfig) && settings.dockItemsConfig.length < mainStore.dockItems.length) {
    const missingItems = mainStore.dockItems.filter(dock => !settings.dockItemsConfig.some(item => item.page === dock.page))
    settings.dockItemsConfig = [
      ...settings.dockItemsConfig,
      ...missingItems.map(dock => ({ page: dock.page, visible: true, openInNewTab: false, useOriginalLuoguPage: false })),
    ]
  }
  else if (!Array.isArray(settings.dockItemsConfig) || settings.dockItemsConfig.length !== mainStore.dockItems.length) {
    settings.dockItemsConfig = mainStore.dockItems.map(dock =>
      ({ page: dock.page, visible: true, openInNewTab: false, useOriginalLuoguPage: false }),
    )
  }

  const targetDockItems: DockItem[] = []

  settings.dockItemsConfig.forEach((item) => {
    const foundItem = mainStore.dockItems.find(defaultItem => defaultItem.page === item.page)
    item.visible && targetDockItems.push({
      i18nKey: foundItem?.i18nKey || '',
      icon: foundItem?.icon || '',
      iconActivated: foundItem?.iconActivated || '',
      page: foundItem?.page || AppPage.Home,
      openInNewTab: item.openInNewTab,
      useOriginalLuoguPage: item.useOriginalLuoguPage || false,
      url: foundItem?.url || '',
    })
  })
  return targetDockItems
}

function toggleHideDock(hide: boolean) {
  if (settings.autoHideDock)
    hideDock.value = hide
  else
    hideDock.value = false
}

function handleDockItemClick($event: MouseEvent, dockItem: DockItem) {
  console.log('[GulyGuly Dock] click:', dockItem.page)
  if ($event.ctrlKey || $event.metaKey) {
    openDockItemInNewTab(dockItem)
    return
  }

  activatedDockItem.value = dockItem
  emit('dockItemClick', dockItem)
}

function openDockItemInNewTab(dockItem: DockItem) {
  activatedDockItem.value = dockItem
  window.open(dockItem.url, '_blank')
}

function handleBackToTopOrRefresh(action: 'backToTop' | 'refresh' | 'auto' = 'auto') {
  if (action === 'backToTop') {
    emit('backToTop')
  }
  else if (action === 'refresh') {
    emit('refresh')
    emit('backToTop')
  }
  else {
    if (reachTop.value)
      emit('refresh')
    else
      emit('backToTop')
  }
}

function isDockItemActivated(dockItem: DockItem): boolean {
  return props.activatedPage === dockItem.page
}

const { width: windowWidth, height: windowHeight } = useWindowSize()
const { width: dockWidth, height: dockHeight } = useElementSize(dockContentRef)

const dockScale = computed((): number => {
  if (!dockHeight.value || !dockWidth.value)
    return 1

  const maxAllowedHeight = windowHeight.value - 180
  const maxAllowedWidth = windowWidth.value - 180

  const heightScale = dockHeight.value > maxAllowedHeight
    ? maxAllowedHeight / dockHeight.value
    : 1

  const widthScale = dockWidth.value > maxAllowedWidth
    ? maxAllowedWidth / dockWidth.value
    : 1

  return Math.min(heightScale, widthScale)
})

const dockTransformStyle = computed((): { transform: string, transformOrigin: string } => {
  const position = settings.dockPosition
  const scale = dockScale.value

  const origin = {
    left: 'left center',
    right: 'right center',
    bottom: 'center bottom',
  }[position] || 'center center'

  return {
    transform: `scale(${scale})`,
    transformOrigin: origin,
  }
})
</script>

<template>
  <aside
    class="dock-wrap"
    pos="fixed top-0" z-100 flex="~ col justify-center items-center" w-full h-full
    z-10 pointer-events-none
  >
    <!-- Edge Div -->
    <div
      v-if="settings.autoHideDock && hideDock"
      class="dock-edge"
      :class="`dock-edge-${settings.dockPosition}`"
      @mouseenter="toggleHideDock(false)"
      @mouseleave="toggleHideDock(true)"
    />

    <!-- Dock Content -->
    <div
      ref="dockContentRef"
      class="dock-content"
      :class="{
        'left': settings.dockPosition === 'left',
        'right': settings.dockPosition === 'right',
        'bottom': settings.dockPosition === 'bottom',
        'hide': hideDock,
        'half-hide': settings.halfHideDock,
        'hover': dockContentHover,
      }"
      :style="dockTransformStyle"
      @mouseenter="toggleHideDock(false)"
      @mouseleave="toggleHideDock(true)"
    >
      <div
        class="dock-content-inner"
      >
        <template v-for="dockItem in currentDockItems" :key="dockItem.page">
          <button
            class="dock-item group"
            :class="{
              'active': isDockItemActivated(dockItem),
              'inactive': hoveringDockItem.themeMode && isDark,
              'disable-glowing-effect': settings.disableDockGlowingEffect,
            }"
            :title="$t(dockItem.i18nKey)"
            pointer-events-auto
            @click="handleDockItemClick($event, dockItem)"
            @click.middle="openDockItemInNewTab(dockItem)"
          >
            <span
              v-html="renderIcon(isDockItemActivated(dockItem) ? dockItem.iconActivated : dockItem.icon, 22)"
              style="display:contents"
            />
            <!-- Unread badge for messages -->
            <span v-if="dockItem.page === AppPage.Messages && unreadMsgCount > 0"
              class="dock-badge"
              :style="{ background: isDockItemActivated(dockItem) ? 'var(--bew-error-color)' : '#e74c3c' }"
            >{{ unreadMsgCount > 99 ? '99+' : unreadMsgCount }}</span>
          </button>
        </template>

        <!-- dividing line -->
        <div class="divider" />

        <!-- Dark/Light mode toggle -->
        <div
          v-if="!settings.disableLightDarkModeSwitcherOnDock"
          class="group"
          relative
          pointer-events-none
        >
          <!-- moon glow -->
          <div
            v-if="isDark"
            pos="absolute top-0 left-0 group-hover:top-2px group-hover:left--4px"
            w-full h-full bg-white rounded-full
            z--2 pointer-events-none
            shadow="group-hover:[-8px_4px_160px_20px_hsla(226deg,85%,77%,1),-8px_4px_100px_12px_hsla(226deg,85%,77%,0.8),-8px_4px_60px_10px_hsla(226deg,85%,77%,0.6),-8px_4px_20px_4px_hsla(226deg,85%,77%,0.4),-4px_2px_8px_0_hsla(226deg,85%,77%,0.8)]"
            opacity-0 group-hover:opacity-100
            duration-600
          />

          <button
            class="dock-item"
            bg="!dark-hover:$bew-bg" transform="!dark-hover:scale-100"
            shadow="!dark-hover:[inset_4px_-2px_8px_hsla(226deg,85%,77%,1)]"
            pointer-events-auto
            @click="toggleDark"
            @mouseenter="hoveringDockItem.themeMode = true"
            @mouseleave="hoveringDockItem.themeMode = false"
          >
            <span v-if="isDark" v-html="renderIcon('line-md:moon-to-sunny-outline-transition', 22)" style="display:contents;pointer-events:none" />
            <span v-else v-html="renderIcon('line-md:sunny-outline-to-moon-transition', 22)" style="display:contents;pointer-events:none" />
          </button>
        </div>

        <!-- Settings button -->
        <button
          class="dock-item group"
          :class="{
            inactive: hoveringDockItem.themeMode && isDark,
          }"
          title="设置"
          pointer-events-auto
          @click="emit('settingsVisibilityChange')"
        >
          <span v-html="renderIcon('mingcute:settings-3-line', 22)" style="display:contents" />
        </button>
      </div>

      <!-- Back to top & refresh buttons -->
      <div
        v-if="showBackToTopOrRefreshButton"
        :style="{
          bottom: settings.dockPosition === 'bottom' ? 'unset' : 0,
          right: settings.dockPosition === 'bottom' ? 0 : 'unset',
          transform: settings.dockPosition === 'bottom' ? 'translate(100%, 0)' : 'translateY(100%)',
          flexDirection: settings.dockPosition === 'bottom' ? 'row' : 'column',
        }"
        pos="absolute"
        flex="~ gap-2"
      >
        <template v-if="settings.backToTopAndRefreshButtonsAreSeparated">
          <template v-for="key in 2" :key="key">
            <Transition name="fade">
              <button
                v-if="key === 1 || (key === 2 && !reachTop)"
                class="back-to-top-or-refresh-btn"
                :class="{
                  inactive: hoveringDockItem.themeMode && isDark,
                }"
                @click="handleBackToTopOrRefresh(key === 1 ? 'refresh' : 'backToTop')"
              >
                  <span
                  v-if="key === 1"
                  v-html="renderIcon('line-md:rotate-270', 24)"
                  style="display:contents"
                />
                <span
                  v-else
                  v-html="renderIcon('line-md:arrow-small-up', 24)"
                  style="display:contents"
                />
              </button>
            </Transition>
          </template>
        </template>
        <template v-else>
          <button
            class="back-to-top-or-refresh-btn"
            :class="{
              inactive: hoveringDockItem.themeMode && isDark,
            }"
            @click="handleBackToTopOrRefresh('auto')"
          >
            <Transition name="fade">
              <span
                v-if="reachTop"
                v-html="renderIcon('line-md:rotate-270', 24)"
                style="display:contents"
              />
              <span
                v-else
                v-html="renderIcon('line-md:arrow-small-up', 24)"
                style="display:contents"
              />
            </Transition>
          </button>
        </template>
      </div>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.dock-wrap {
  > * {
    --uno: "pointer-events-auto";
  }
}

.dock-edge {
  &-left,
  &-right,
  &-bottom {
    --uno: "absolute z--1";
  }

  &-left {
    --uno: "left-0 top-0 w-14px h-full hover:w-60px";
  }

  &-right {
    --uno: "right-0 top-0 w-14px h-full hover:w-60px";
  }

  &-bottom {
    --uno: "left-0 bottom-0 w-full h-14px hover-h-60px";
  }
}

.dock-content {
  --uno: "absolute flex justify-center items-center duration-300";

  &.left {
    --uno: "left-2 after:right--4px";
  }
  &.left.hide:not(.hover) {
    --uno: "opacity-0 !translate-x--100%";
  }
  &.left.half-hide:not(.hover) {
    --uno: "!opacity-60 !translate-x--50%";
  }

  &.right {
    --uno: "right-2 after:left--4px";
  }
  &.right.hide:not(.hover) {
    --uno: "opacity-0 !translate-x-100%";
  }
  &.right.half-hide:not(.hover) {
    --uno: "!opacity-60 !translate-x-50%";
  }

  &.bottom {
    --uno: "top-unset bottom-0";
  }
  &.bottom.hide:not(.hover) {
    --uno: "opacity-0 !translate-y-100%";
  }
  &.bottom.half-hide:not(.hover) {
    --uno: "!opacity-60 !translate-y-50%";
  }

  .divider {
    --uno: "my-1 mx-3 h-3px bg-$bew-border-color rounded-4";
  }

  &.bottom .divider {
    --uno: "w-3px h-auto my-3 mx-1";
  }

  .dock-content-inner {
    --uno: "duration-300 ease-in-out transform-gpu";
    --uno: "p-2 m-2 bg-$bew-content-alt dark:bg-$bew-elevated";
    --uno: "flex flex-col gap-2 shrink-0";
    --uno: "rounded-full border-1 border-$bew-border-color";
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
    backdrop-filter: var(--bew-filter-glass-1);
  }

  &.bottom .dock-content-inner {
    --uno: "flex-row";
  }

  .back-to-top-or-refresh-btn {
    overflow: hidden; /* SVG stroke animation stays inside button */
    --uno: "transform active:important-scale-90 hover:scale-110";
    --uno: "lg:w-45px w-35px lg:h-45px h-35px";
    --uno: "grid place-items-center";
    --uno: "filter-$bew-filter-glass-1";
    --uno: "bg-$bew-elevated hover:bg-$bew-content-hover";
    --uno: "rounded-full shadow-$bew-shadow-2 border-1 border-$bew-border-color";

    backdrop-filter: var(--bew-filter-glass-1);
    transition:
      transform 300ms cubic-bezier(0.34, 2, 0.6, 1),
      background 300ms ease,
      color 300ms ease,
      box-shadow 300ms ease,
      opacity 600ms ease;
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);

    &.active {
      --uno: "important-bg-$bew-theme-color-auto text-$bew-text-auto";
      --uno: "shadow-$shadow-active dark:shadow-$shadow-dark";
      --uno: "active:shadow-$shadow-active-active dark-active:shadow-$shadow-dark-active";
    }

    &.inactive {
      --uno: "opacity-80 !shadow-none";
    }
  }

  &.bottom .back-to-top-or-refresh-btn {
    --uno: "bottom-unset lg:right--45px right--35px";
  }
}

.dock-item {
  --shadow-dark: 0 4px 30px 4px rgba(255, 255, 255, 0.6);
  --shadow-active: 0 4px 30px var(--bew-theme-color-60);
  --shadow-dark-active: 0 4px 20px rgba(255, 255, 255, 0.8);
  --shadow-active-active: 0 4px 20px var(--bew-theme-color-80);

  --uno: "relative transform active:important-scale-90 hover:scale-110";
  --uno: "lg:w-45px w-35px";
  --uno: "lg:lh-45px lh-35px";
  --uno: "p-0 flex items-center justify-center";
  --uno: "aspect-square relative";
  --uno: "leading-0";
  --uno: "rounded-60px antialiased";
  --uno: "bg-$bew-fill-alt hover:bg-$bew-fill-2 cursor-pointer";
  --uno: "dark:bg-$bew-fill-1 dark-hover:bg-$bew-fill-4";

  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
  transition:
    transform 300ms cubic-bezier(0.34, 2, 0.6, 1),
    background 300ms ease,
    color 300ms ease,
    box-shadow 600ms ease,
    opacity 600ms ease;

  &:hover {
    box-shadow:
      var(--bew-shadow-edge-glow-1),
      0 0 0 2px var(--bew-fill-2),
      var(--bew-shadow-2);
  }

  &.disable-glowing-effect {
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1) !important;
  }

  &.active {
    --uno: "important-bg-$bew-theme-color text-white !dark:bg-white !dark:text-black";
    --uno: "shadow-$shadow-active dark:shadow-$shadow-dark";
    --uno: "active:shadow-$shadow-active-active dark-active:shadow-$shadow-dark-active";
  }

  &.inactive {
    --uno: "opacity-80 !shadow-none";
  }

  .dock-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    box-shadow: 0 1px 3px rgba(0,0,0,.3);
  }

  svg {
    --uno: "lg:w-22px w-18px lg:h-22px h-18px block align-middle";
    pointer-events: none;
  }
}

.fade-enter-active,
.fade-leave-active {
  --uno: "transition-all duration-300";
}

.fade-leave-to,
.fade-enter-from {
  --uno: "opacity-0";
}
</style>
