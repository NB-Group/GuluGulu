<script setup lang="ts">
import { useDark } from '~/composables/useDark'
import { settings } from '~/logic'

defineProps<{ activatedPage: string }>()
const { isDark } = useDark()
</script>

<template>
  <div
    :style="{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: -2,
      background: isDark
        ? 'linear-gradient(180deg, hsl(230 12% 8%) 0%, hsl(230 12% 4%) 100%)'
        : 'linear-gradient(180deg, hsl(240 31% 96%) 0%, hsl(0 0% 100%) 100%)',
    }"
  />
  <!-- Wallpaper layer -->
  <div
    v-if="settings.wallpaper"
    :style="{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: -1,
      backgroundImage: `url(${settings.wallpaper})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      filter: `blur(${settings.wallpaperBlurIntensity || 0}px)`,
      transform: 'scale(1.05)', // hide blur edge bleed
    }"
  />
  <!-- Mask overlay for readability -->
  <div
    v-if="settings.wallpaper && settings.enableWallpaperMasking"
    :style="{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: -1,
      background: isDark
        ? `rgba(0, 0, 0, ${(settings.wallpaperMaskOpacity || 50) / 100})`
        : `rgba(255, 255, 255, ${(settings.wallpaperMaskOpacity || 50) / 100})`,
    }"
  />
</template>
