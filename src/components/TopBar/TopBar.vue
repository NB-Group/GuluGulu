<script setup lang="ts">
import { onClickOutside, onKeyStroke, useMouseInElement } from '@vueuse/core'
import type { Ref } from 'vue'
import { computed, reactive, ref } from 'vue'

import { useGulyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { useDelayedHover } from '~/composables/useDelayedHover'
// === Message notification polling ===
import { useMessagePolling } from '~/composables/useMessagePolling'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { renderIcon } from '~/utils/icons'
import { searchKeyword } from '~/utils/luogu-api'

const { activatedPage, scrollbarRef, reachTop, navigateTo } = useGulyApp()

function goToLogin() {
  location.href = 'https://www.luogu.com.cn/auth/login'
}

async function logoutAndSwitch() {
  // Clear Luogu session, then go to homepage (shows login button)
  try {
    await browser.runtime.sendMessage({ contentScriptQuery: 'HOME.logout' })
  }
  catch (e) { console.warn('[GuluGulu]', e) }
  location.href = 'https://www.luogu.com.cn/'
}

function handleSearch(keyword: string) {
  import.meta.env.DEV && console.log('[GuluGulu TopBar] search:', keyword)
  searchKeyword.value = keyword
  ;(window as any).__guly_search_pending = keyword
  if (activatedPage.value === AppPage.ProblemList) {
    // Already on problem list — watcher will handle the refetch
  }
  navigateTo(AppPage.ProblemList)
}
const { isDark } = useDark()

const userName = ref('')
const userUid = ref(0)
const userColor = ref('')

const hideTopBar = ref<boolean>(false)
const headerTarget = ref(null)
const { isOutside: isOutsideTopBar } = useMouseInElement(headerTarget)

// Check login state via frontend API fetch
const isLogin = ref(false)
onMounted(async () => {
  const stored = (window as any).__guly_user
  if (stored?.uid && stored.uid !== '0') {
    isLogin.value = true
    userUid.value = Number(stored.uid)
    if (stored.name)
      userName.value = stored.name
    if (stored.color)
      userColor.value = stored.color
    return
  }
  // Fallback: fetch directly from frontend
  try {
    const res = await fetch('https://www.luogu.com.cn/record/list?_contentOnly=1', { credentials: 'same-origin' })
    const json = await res.json()
    const user = json?.user || json?.currentUser
    if (user?.uid) {
      isLogin.value = true
      userUid.value = Number(user.uid)
      if (user.name)
        userName.value = user.name
      if (user.color)
        userColor.value = user.color
      ;(window as any).__guly_user = { uid: String(user.uid), name: user.name || '', color: user.color || '', csrfToken: '' }
    }
  }
  catch (e) { console.warn('[GuluGulu]', e) }
})
const { unreadMsgCount } = useMessagePolling()

function goToMessages() {
  navigateTo(AppPage.Messages, 'https://www.luogu.com.cn/chat')
}

const scrollTop = ref<number>(0)
const oldScrollTop = ref<number>(0)

const drawerVisible = reactive({
  notifications: false,
})

const showSearchBar = computed((): boolean => {
  if (activatedPage.value === AppPage.Search)
    return false
  return true
})

const isTopBarFixed = computed((): boolean => {
  return true
})

// #region Popups visibility control
const popupVisible = reactive({
  userPanel: false,
  notifications: false,
})

function closeAllTopBarPopup(exceptionKey?: keyof typeof popupVisible) {
  Object.keys(popupVisible).forEach((key) => {
    if (key !== exceptionKey)
      popupVisible[key as keyof typeof popupVisible] = false
  })
}

// Avatar
const avatar = setupTopBarItemHoverEvent('userPanel')
// Notifications
const notifications = setupTopBarItemHoverEvent('notifications')

const topBarItemElements: Record<keyof typeof popupVisible, Ref<HTMLElement | undefined>> = {
  userPanel: avatar,
  notifications,
}

function setupTopBarItemHoverEvent(key: keyof typeof popupVisible) {
  return useDelayedHover({
    enterDelay: 320,
    leaveDelay: 320,
    beforeEnter: () => closeAllTopBarPopup(key),
    enter: () => {
      popupVisible[key] = true
    },
    leave: () => {
      popupVisible[key] = false
    },
  })
}

const currentClickedTopBarItem = ref<keyof typeof popupVisible | null>(null)

function handleClickTopBarItem(event: MouseEvent, key: keyof typeof popupVisible) {
  event.preventDefault()
  event.stopPropagation()
  closeAllTopBarPopup(key)
  popupVisible[key] = !popupVisible[key]
  currentClickedTopBarItem.value = key
}

Object.entries(topBarItemElements).forEach(([key, val]) => {
  onClickOutside(val, () => {
    if (currentClickedTopBarItem.value === key)
      popupVisible[key as keyof typeof popupVisible] = false
  })
})

// #endregion

watch(() => settings.value.topBarAutoHide, (newVal) => {
  if (!newVal)
    toggleTopBarVisible(true)
})

onMounted(() => {
  nextTick(() => {
    toggleTopBarVisible(true)
    window.addEventListener('scroll', handleScroll)
  })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

function handleScroll() {
  scrollTop.value = document.documentElement.scrollTop

  if (scrollTop.value === 0)
    toggleTopBarVisible(true)

  if (settings.value.topBarAutoHide && isOutsideTopBar && scrollTop.value !== 0) {
    if (scrollTop.value > oldScrollTop.value)
      toggleTopBarVisible(false)
    else
      toggleTopBarVisible(true)
  }

  oldScrollTop.value = scrollTop.value
}

onKeyStroke('/', (e: KeyboardEvent) => {
  const path = e.composedPath?.() || []
  for (const node of path) {
    if (!(node instanceof HTMLElement))
      continue
    const tag = node.tagName
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || node.isContentEditable || node.getAttribute('contenteditable') === 'true') {
      import.meta.env.DEV && console.log('[TopBar] / blocked by:', tag)
      return
    }
    // Monaco editor — its input may use the EditContext API (not a <textarea>),
    // so the tag check above misses it. Bail when the keystroke originates
    // anywhere inside a Monaco editor instance.
    if (node.classList?.contains('monaco-editor') || node.classList?.contains('overflow-guard'))
      return
  }
  import.meta.env.DEV && console.log('[TopBar] / triggering search')
  toggleTopBarVisible(true)
})

function toggleTopBarVisible(visible: boolean) {
  hideTopBar.value = !visible
}

defineExpose({
  toggleTopBarVisible,
  handleScroll,
})
</script>

<template>
  <Transition name="top-bar">
    <header
      ref="headerTarget"
      w="full" transition="all 300 ease-in-out"
      :class="{ hide: hideTopBar }"
      :style="{ position: isTopBarFixed ? 'fixed' : 'absolute' }"
    >
      <main
        max-w="$bew-page-max-width"
        flex="~ justify-between items-center gap-4"
        p="x-12" m-auto
        h="$bew-top-bar-height"
      >
        <!-- Top bar mask -->
        <div
          v-if="!reachTop"
          style="
            mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1), rgba(0, 0, 0, 1) 24px, rgba(0, 0, 0, 0.9) 44px, transparent);
          "
          :style="{ backdropFilter: settings.disableFrostedGlass ? 'none' : 'var(--bew-filter-glass-1)' }"
          pos="absolute top-0 left-0" w-full h="[calc(var(--bew-top-bar-height)+16px)]"
          pointer-events-none transform-gpu
        />

        <div
          pos="absolute top-0 left-0" w-full
          pointer-events-none opacity-100 duration-300
          :style="{
            background: `linear-gradient(to bottom,
              color-mix(in oklab, var(--bew-bg), transparent 20%),
              color-mix(in oklab, var(--bew-bg), transparent 40%) calc(var(--bew-top-bar-height) / 2),
              transparent)`,
            opacity: reachTop ? 0.8 : 1,
            height: reachTop ? 'var(--bew-top-bar-height)' : 'calc(var(--bew-top-bar-height) + 20px)',
          }"
        />

        <!-- Top bar theme color gradient -->
        <Transition name="fade">
          <div
            v-if="settings.showTopBarThemeColorGradient && reachTop && isDark"
            pos="absolute top-0 left-0" w-full h="$bew-top-bar-height" pointer-events-none
            :style="{ background: 'linear-gradient(to bottom, var(--bew-theme-color-10), transparent)' }"
          />
        </Transition>

        <div shrink-0 flex="inline xl:1 justify-start items-center gap-2" pos="relative" z-1>
          <!-- Logo -->
          <a
            href="https://www.luogu.com.cn"
            target="_top"
            class="logo"
            style="font-size: var(--bew-base-font-size); font-weight: 700; color: var(--bew-theme-color); text-decoration: none;"
          >
            GuluGulu
          </a>
        </div>

        <!-- search bar -->
        <div flex="inline 1 md:justify-center items-center" w="full">
          <Transition name="slide-out">
            <SearchBar
              v-if="showSearchBar"
              class="search-bar"
              :style="{
                '--b-search-bar-normal-color': settings.disableFrostedGlass ? 'var(--bew-elevated)' : 'color-mix(in oklab, var(--bew-elevated-solid), transparent 60%)',
                '--b-search-bar-hover-color': 'var(--bew-elevated-hover)',
                '--b-search-bar-focus-color': 'var(--bew-elevated)',
                '--b-search-bar-normal-icon-color': 'var(--bew-text-1)',
                '--b-search-bar-normal-text-color': 'var(--bew-text-1)',
              }"
              @search="handleSearch"
            />
          </Transition>
        </div>

        <!-- right content -->
        <div
          class="right-side"
          flex="inline xl:1 justify-end items-center"
        >
          <div
            class="others"
            flex="~ items-center gap-1" h-46px px-5px
            text="$bew-text-1"
            transform-gpu
          >
            <div
              v-if="!isLogin"
              class="right-side-item"
            >
              <button
                class="login-btn"
                style="display:flex;align-items:center;gap:6px;padding:0 16px;height:34px;border-radius:9999px;border:none;cursor:pointer;font-size:var(--bew-base-font-size);font-weight:700;background:var(--bew-theme-color-10);color:var(--bew-theme-color);border:1px solid var(--bew-theme-color-20);transition:all .2s"
                @click="goToLogin"
              >
                <span style="display:contents" v-html="renderIcon('mingcute:user-4-line', 18)" />
                登录
              </button>
            </div>
            <!-- Avatar + username + panel -->
            <div
              v-if="isLogin"
              ref="avatar"
              :class="{ hover: popupVisible.userPanel }"
              style="display:flex;align-items:center;gap:8px;cursor:pointer;position:relative;"
              @click="event => handleClickTopBarItem(event, 'userPanel')"
            >
              <div style="width:34px;height:34px;border-radius:50%;overflow:hidden;flex-shrink:0;">
                <img
                  :src="`https://cdn.luogu.com.cn/upload/usericon/${userUid}.png`"
                  style="width:100%;height:100%;object-fit:cover;"
                  @error="(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('span')!.removeAttribute('hidden') }"
                >
                <span style="position:absolute;top:8px;left:8px;" hidden v-html="renderIcon('mingcute:user-4-line', 18)" />
              </div>
              <span v-if="userName" :style="{ fontSize: 'var(--bew-base-font-size)', color: userColor ? `var(--bew-${userColor})` : 'var(--bew-text-1)', fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 'var(--bew-top-bar-height)' }">{{ userName }}</span>
              <!-- User panel popup -->
              <Transition name="dropdown">
                <div v-if="popupVisible.userPanel" class="user-panel-dropdown" @click.stop>
                  <div class="user-panel-header">
                    <img :src="`https://cdn.luogu.com.cn/upload/usericon/${userUid}.png`" style="width:48px;height:48px;border-radius:50%;object-fit:cover">
                    <div>
                      <div style="font-size:var(--bew-base-font-size);font-weight:600;color:var(--bew-text-1)">
                        {{ userName || `UID:${userUid}` }}
                      </div>
                      <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-3)">
                        UID: {{ userUid }}
                      </div>
                    </div>
                  </div>
                  <div class="user-panel-divider" />
                  <a :href="`https://www.luogu.com.cn/user/${userUid}`" target="_blank" class="user-panel-item">
                    <span style="display:contents" v-html="renderIcon('mingcute:user-4-line', 16)" />
                    个人主页
                  </a>
                  <a href="https://www.luogu.com.cn/chat" target="_blank" class="user-panel-item">
                    <span style="display:contents" v-html="renderIcon('mingcute:notification-line', 16)" />
                    通知
                  </a>
                  <a href="https://www.luogu.com.cn/record/list" target="_blank" class="user-panel-item">
                    <span style="display:contents" v-html="renderIcon('mingcute:clipboard-line', 16)" />
                    评测记录
                  </a>
                  <div class="user-panel-divider" />
                  <button class="user-panel-item" style="width:100%;text-align:left;border:none;background:none;cursor:pointer" @click="logoutAndSwitch">
                    <span style="display:contents" v-html="renderIcon('mingcute:exit-line', 16)" />
                    切换账号
                  </button>
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </main>
    </header>
  </Transition>
</template>

<style lang="scss" scoped>
.top-bar-enter-active,
.top-bar-leave-active {
  transition: all 0.5s ease;
}

.top-bar-enter-from,
.top-bar-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

.slide-out-enter-active,
.slide-out-leave-active {
  transition: all 0.3s ease;
  pointer-events: none;
  transform: translateZ(0);
}

.slide-out-leave-to,
.slide-out-enter-from {
  transform: translateY(-16px) !important;
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.6s ease;
}

.fade-leave-to,
.fade-enter-from {
  opacity: 0;
}

.hide {
  transform: translateY(-100%);
}

.user-panel-dropdown {
  position: absolute;
  top: 56px;
  right: 0;
  min-width: 200px;
  background: var(--bew-content);
  backdrop-filter: var(--bew-filter-glass-2);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  box-shadow: var(--bew-shadow-4), var(--bew-shadow-edge-glow-2);
  padding: 8px;
  z-index: 1000;
}

.user-panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
}

.user-panel-divider {
  height: 1px;
  background: var(--bew-border-color);
  margin: 4px 0;
}

.user-panel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--bew-text-2);
  text-decoration: none;
  font-size: var(--bew-base-font-size);
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--bew-fill-2);
    color: var(--bew-text-1);
  }
}

:deep(.search-bar) {
  input:not(:focus, :focus-within) {
    border-color: var(--bew-border-color) !important;
    box-shadow: var(--bew-shadow-1) !important;
  }
}

.logo {
  cursor: pointer;
}

.right-side {
  .avatar {
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    z-index: 1;
    border-radius: 50%;
    width: 46px;
    height: 46px;

    &:hover::after,
    &.hover::after {
      content: "";
      position: absolute;
      right: 0;
      top: 20px;
      width: 110px;
      height: 120px;
    }

    .avatar-img,
    .avatar-shadow {
      flex-shrink: 0;
      transition: all 0.3s ease;
      border-radius: 50%;
      width: 34px;
      height: 34px;
      background-size: cover;
      background-position: center;

      &.hover {
        transform: scale(2.3) translateY(50px) translateX(-36px);
      }
    }

    .avatar-img {
      z-index: 1;
    }
  }

  .right-side-item {
    position: relative;
    color: var(--bew-text-1);
    display: flex;
    align-items: center;

    &:not(.avatar) a {
      font-size: 1.125rem;
      display: grid;
      place-items: center;
      border-radius: 40px;
      transition: all 0.3s ease;
      position: relative;
      z-index: 5;
      height: 34px;
      width: 34px;
      filter: drop-shadow(0 0 4px var(--bew-bg));
    }

    &.active a,
    & a:hover {
      background: var(--bew-fill-2);
    }
  }

  .right-side-item .login {
    width: auto !important;
    display: flex !important;
    align-items: center;
    background: var(--bew-theme-color-10);
    border-radius: 9999px;
    border: none;
    cursor: pointer;
    color: var(--bew-theme-color) !important;
    padding: 0 16px !important;
    font-size: 1rem !important;
    height: 34px;

    &:hover {
      background: var(--bew-theme-color) !important;
      color: white !important;
    }
  }
}
</style>
