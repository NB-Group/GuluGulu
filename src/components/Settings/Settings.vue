<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { renderIcon } from '~/utils/icons'

const emit = defineEmits(['close'])

const { t } = useI18n()

enum MenuType {
  General = 'General',
  AICompletion = 'AICompletion',
  DesktopAndDock = 'DesktopAndDock',
  Appearance = 'Appearance',
  About = 'About',
}

interface MenuItem {
  value: MenuType
  icon: string
  iconActivated: string
  title: string
}

const settingsMenu = {
  [MenuType.General]: defineAsyncComponent(() => import('./General/General.vue')),
  [MenuType.AICompletion]: defineAsyncComponent(() => import('./AICompletion/AICompletion.vue')),
  [MenuType.DesktopAndDock]: defineAsyncComponent(() => import('./DesktopAndDock/DesktopAndDock.vue')),
  [MenuType.Appearance]: defineAsyncComponent(() => import('./Appearance/Appearance.vue')),
  [MenuType.About]: defineAsyncComponent(() => import('./About/About.vue')),
}

const activatedMenuItem = ref<MenuType>(MenuType.General)
const title = ref<string>('通用')
const settingsWindow = ref<HTMLDivElement>()
const visible = ref(false)

useEventListener(window, 'resize', () => {
  // Handle resize if needed
})

const scrollbarRef = ref()

watch(
  () => activatedMenuItem.value,
  () => {
    const osInstance = scrollbarRef.value?.osInstance?.()
    if (osInstance?.elements)
      osInstance.elements().viewport.scrollTop = 0
  },
)

const settingsMenuItems = computed((): MenuItem[] => {
  return [
    {
      value: MenuType.General,
      icon: 'mingcute:settings-3-line',
      iconActivated: 'mingcute:settings-3-fill',
      title: '通用',
    },
    {
      value: MenuType.AICompletion,
      icon: 'mingcute:ai-line',
      iconActivated: 'mingcute:ai-fill',
      title: 'AI 自动补全',
    },
    {
      value: MenuType.DesktopAndDock,
      icon: 'mingcute:computer-line',
      iconActivated: 'mingcute:computer-fill',
      title: '桌面与导航坞',
    },
    {
      value: MenuType.Appearance,
      title: '外观',
      icon: 'mingcute:paint-brush-line',
      iconActivated: 'mingcute:paint-brush-fill',
    },
    {
      value: MenuType.About,
      icon: 'mingcute:information-line',
      iconActivated: 'mingcute:information-fill',
      title: '关于',
    },
  ]
})

function open() {
  setCurrentTitle()
  requestAnimationFrame(() => {
    visible.value = true
  })
}

onMounted(open)
onActivated(open)

function handleClose() {
  visible.value = false
  // Wait for animation to finish
  setTimeout(() => {
    emit('close')
  }, 300)
}

function changeMenuItem(menuItem: MenuType) {
  activatedMenuItem.value = menuItem
  setCurrentTitle()
}

function setCurrentTitle() {
  settingsMenuItems.value.forEach((item) => {
    if (item.value === activatedMenuItem.value)
      title.value = item.title
  })
}
</script>

<template>
  <Transition name="modal">
    <div v-if="visible" class="fixed w-full h-full top-0 left-0" z-10000>
      <div
        class="fixed w-full h-full top-0 left-0"
        bg="black opacity-40"
        @click="handleClose"
      />
      <div
        id="settings-window"
        ref="settingsWindow"
        pos="fixed top-1/2 left-1/2" w="90%" h="90%"
        max-w-1000px max-h-900px transform="~ translate-x--1/2 translate-y--1/2 gpu"
        flex="~ justify-between items-center"
      >
        <aside
          :class="{ group: !settings.touchScreenOptimization }"
          shrink-0 p="x-4" pos="absolute xl:left--84px left--44px" z-2
        >
          <ul
            style="
              box-shadow: var(--bew-shadow-4);
            "
            relative flex="~ gap-2 col" rounded="30px group-hover:25px" p-2
            bg="$bew-content-alt group-hover:$bew-elevated dark:$bew-elevated dark-group-hover:$bew-elevated"
            scale="group-hover:105" duration-300 overflow-hidden antialiased transform-gpu
          >
            <!-- frosted glass background -->
            <div
              style="
                box-shadow: var(--bew-shadow-edge-glow-2);
                backdrop-filter: var(--bew-filter-glass-2);
              "
              pos="absolute top-0 left-0" z--1
              w-full h-full pointer-events-none
              border="1 $bew-border-color" transform-gpu
              rounded-inherit duration-inherit
            />

            <li v-for="menuItem in settingsMenuItems" :key="menuItem.value">
              <a
                cursor-pointer w="40px group-hover:190px" h-40px
                rounded-30px flex items-center overflow-x-hidden
                duration-300 bg="hover:$bew-fill-2"
                :class="{ 'menu-item-activated': menuItem.value === activatedMenuItem }"
                @click="changeMenuItem(menuItem.value)"
              >
                <div
                  v-show="menuItem.value !== activatedMenuItem"
                  class="settings-icon"
                  w-40px h-20px flex="~ shrink-0" justify-center items-center
                  v-html="renderIcon(menuItem.icon, 20)"
                />
                <div
                  v-show="menuItem.value === activatedMenuItem"
                  class="settings-icon settings-icon-active"
                  w-40px h-20px flex="~ shrink-0" justify-center items-center
                  v-html="renderIcon(menuItem.iconActivated, 20)"
                />
                <span shrink-0>{{ menuItem.title }}</span>
              </a>
            </li>
          </ul>
        </aside>

        <div
          class="settings-content"
          style="
            --un-shadow: var(--bew-shadow-4), var(--bew-shadow-edge-glow-2);
            backdrop-filter: var(--bew-filter-glass-2);
          "
          relative overflow="x-hidden" w-full h-full bg="$bew-elevated-alt"
          shadow rounded="$bew-radius" border="1 $bew-border-color" transform-gpu
        >
          <header
            flex justify-between items-center w-full h-80px
            pos="fixed top-0 left-0" p="x-11"
            z-1 rounded="t-$bew-radius"
            style="
              text-shadow: 0 0 10px var(--bew-elevated-solid), 0 0 15px var(--bew-elevated-solid)
            "
          >
            <!-- Mask -->
            <div
              pos="absolute top-0 left-0" w-inherit h-inherit pointer-events-none
              style="
                mask-image: linear-gradient(to bottom,  black 0, transparent 100%);
                -webkit-mask-image: linear-gradient(to bottom, black 0, transparent 100%);
                backdrop-filter: var(--bew-filter-glass-1);
              "
              z--1 rounded-inherit transform-gpu
            />
            <div text="3xl" fw-bold>
              {{ title }}
            </div>
            <div
              style="
                backdrop-filter: var(--bew-filter-glass-1);
                box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
              "
              text="!16px hover:$bew-theme-color" w="32px" h="32px"
              flex="~ items-center justify-center shrink-0"
              bg="$bew-elevated dark:$bew-fill-1 hover:$bew-theme-color-30"
              rounded-8 cursor="pointer" border="1 $bew-border-color" box-border
              duration-300
              @click="handleClose"
            >
              <span v-html="renderIcon('mingcute:close-line', 16)" style="display:contents" />
            </div>
          </header>
          <OverlayScrollbarsComponent
            ref="scrollbarRef"
            style="
              mask-image: linear-gradient(to bottom, transparent 0%, black 80px 30%);
              -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 80px 30%);
            "
            element="div" defer
            h-inherit
          >
            <main
              pos="absolute top-80px left-0" w-full min-h="[calc(100%-80px)]" p="x-12 b-10"
            >
              <Transition name="page-fade" mode="out-in">
                <Component :is="settingsMenu[activatedMenuItem]" :key="activatedMenuItem" />
              </Transition>
            </main>
          </OverlayScrollbarsComponent>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.menu-item-activated {
  color: var(--bew-text-auto);
  background-color: var(--bew-theme-color);
  transform: translateX(2px);
  box-shadow: inset 3px 0 0 var(--bew-theme-color);
  transition:
    transform var(--bew-dur-normal) var(--bew-ease-overshoot),
    box-shadow var(--bew-dur-normal) var(--bew-ease-smooth),
    background-color var(--bew-dur-normal) var(--bew-ease-smooth),
    color var(--bew-dur-normal) var(--bew-ease-smooth);
}


// Settings sidebar icon container
.settings-icon {
  :deep(svg) {
    width: 20px;
    height: 20px;
    color: var(--bew-text-2);
  }
}

// Active icon should use auto text color (white in dark, black in light)
.settings-icon-active {
  :deep(svg) {
    color: var(--bew-text-auto);
  }
}
</style>
