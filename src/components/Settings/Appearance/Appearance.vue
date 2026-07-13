<script lang="ts" setup>
import { useThrottleFn } from '@vueuse/core'

import { settings } from '~/logic'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const themeColorOptions = computed<Array<string>>(() => {
  return [
    '#22c55e',
    '#34d399',
    '#14b8a6',
    '#06b6d4',
    '#00a1d6',
    '#3498db',
    '#3b82f6',
    '#6366f1',
    '#818cf8',
    '#a78bfa',
    '#f46d43',
    '#fb923c',
    '#f59e0b',
    '#eab308',
    '#f43f5e',
    '#e91e63',
    '#fda4af',
  ]
})
const isCustomColor = computed<boolean>(() => {
  return !themeColorOptions.value.includes(settings.value.themeColor)
})
const themeOptions = computed<Array<{ value: string, label: string }>>(() => {
  return [
    { label: '浅色', value: 'light' },
    { label: '深色', value: 'dark' },
    { label: '自动', value: 'auto' },
  ]
})

watch(
  () => settings.value.wallpaper,
  (newValue) => {
    changeWallpaper(newValue)
  },
)

function changeThemeColor(color: string) {
  settings.value.themeColor = color
}
const changeThemeColorThrottle = useThrottleFn((color: string) => changeThemeColor(color), 100)

function changeWallpaper(url: string) {
  if (url)
    settings.value.enableWallpaperMasking = true
  else settings.value.enableWallpaperMasking = false
  settings.value.wallpaper = url
}

const uploadInputRef = ref<HTMLInputElement>()

function triggerUpload() {
  uploadInputRef.value?.click()
}

function handleUploadWallpaper(e: Event) {
  const file = (e.target as HTMLInputElement)?.files?.[0]
  if (!file)
    return

  const reader = new FileReader()
  reader.readAsDataURL(file)
  reader.onload = () => {
    changeWallpaper(reader.result as string)
  }
}

function handleRemoveCustomWallpaper() {
  changeWallpaper('')
}
</script>

<template>
  <div>
    <SettingsItemGroup title="主题">
      <SettingsItem title="主题模式" desc="选择浅色、深色或跟随系统">
        <Select v-model="settings.themeMode" w-full :options="themeOptions" />
      </SettingsItem>
      <SettingsItem title="主题色" desc="选择你喜欢的主题色">
        <div flex="~ gap-2 wrap" justify-end>
          <div
            v-for="color in themeColorOptions"
            :key="color"
            w-20px
            h-20px
            rounded-8
            cursor-pointer
            transition
            duration-300
            box-border
            :style="{
              background: color,
              transform: color === settings.themeColor ? 'scale(1.3)' : 'scale(1)',
              border: color === settings.themeColor ? '2px solid white' : '2px solid transparent',
              boxShadow:
                color === settings.themeColor ? '0 0 0 1px var(--bew-border-color), var(--bew-shadow-1)' : 'none',
            }"
            @click="changeThemeColor(color)"
          />
          <div
            w-20px
            h-20px
            rounded-8
            overflow-hidden
            cursor-pointer
            transition
            duration-300
            flex="~ items-center justify-center"
            :style="{
              transform: isCustomColor ? 'scale(1.3)' : 'scale(1)',
              border: isCustomColor ? '2px solid white' : `2px solid ${settings.themeColor}`,
              boxShadow: isCustomColor ? '0 0 0 1px var(--bew-border-color), var(--bew-shadow-1)' : 'none',
            }"
          >
            <div
              i-mingcute:color-picker-line pos="absolute" text-white w-12px h-12px
              pointer-events-none
            />
            <input
              :value="settings.themeColor"
              type="color"
              w-30px
              h-30px
              p-0
              m-0
              block
              shrink-0
              rounded-8
              border-none
              cursor-pointer
              @input="(e) => changeThemeColorThrottle((e.target as HTMLInputElement)?.value)"
            >
          </div>
        </div>
      </SettingsItem>

      <SettingsItem title="渐变主题色背景" desc="在背景中使用主题色渐变">
        <Radio v-model="settings.useLinearGradientThemeColorBackground" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup title="壁纸">
      <SettingsItem title="壁纸 URL" desc="设置自定义背景壁纸，留空则使用纯色渐变背景">
        <template #bottom>
          <div flex items-center gap-4>
            <picture
              v-if="settings.wallpaper"
              aspect-video
              bg="$bew-fill-1"
              rounded="$bew-radius"
              overflow-hidden
              cursor-pointer
              shrink-0
              w="xl:1/5 lg:1/4 md:1/3"
            >
              <img
                :src="settings.wallpaper"
                alt="壁纸预览"
                w-full
                h-full
                object-cover
                onerror="
                  this.style.display = 'none'
                  this.onerror = null
                "
              >
            </picture>
            <div flex-1 flex="~ col gap-2">
              <Input v-model="settings.wallpaper" w-full placeholder="输入图片 URL 或上传本地图片" />
              <div flex="~ gap-2">
                <input ref="uploadInputRef" type="file" accept="image/*" hidden @change="handleUploadWallpaper">
                <Button v-if="!settings.wallpaper" type="default" @click="triggerUpload">
                  上传本地图片
                </Button>
                <Button v-if="settings.wallpaper" type="error" @click="handleRemoveCustomWallpaper">
                  移除壁纸
                </Button>
              </div>
            </div>
          </div>
        </template>
      </SettingsItem>

      <SettingsItem title="壁纸遮罩" desc="启用遮罩使文字更清晰">
        <Radio v-model="settings.enableWallpaperMasking" />
      </SettingsItem>
      <SettingsItem v-if="settings.enableWallpaperMasking" title="遮罩透明度">
        <Slider v-model="settings.wallpaperMaskOpacity" :label="`${settings.wallpaperMaskOpacity}%`" />
      </SettingsItem>
      <SettingsItem v-if="settings.enableWallpaperMasking" title="壁纸模糊强度">
        <Slider
          v-model="settings.wallpaperBlurIntensity"
          :min="0"
          :max="60"
          :label="`${settings.wallpaperBlurIntensity}px`"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup>
      <SettingsItem title="自定义 CSS" desc="⚠️ 请谨慎使用，错误的 CSS 可能导致界面异常">
        <Radio v-model="settings.customizeCSS" />
        <template v-if="settings.customizeCSS" #bottom>
          <textarea
            v-model="settings.customizeCSSContent"
            w-full
            h-200px
            p-4
            font-mono
            text-sm
            bg="$bew-fill-1"
            border="1 $bew-border-color"
            rounded="$bew-radius"
            text="$bew-text-1"
            outline-none
            placeholder="/* 在此输入自定义 CSS */"
            @keydown.stop.passive="() => {}"
          />
        </template>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
textarea {
  resize: vertical;
  &:focus {
    border-color: var(--bew-theme-color);
    box-shadow: 0 0 0 2px var(--bew-theme-color-30);
  }
}
</style>
