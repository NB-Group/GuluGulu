<script setup lang="ts">
import { version } from '~/../package.json'
import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
</script>

<template>
  <div flex="~ col gap-4">
    <SettingsItemGroup title="关于 GuluGulu">
      <SettingsItem title="版本" desc="当前扩展版本">
        <span style="color:var(--bew-text-2);font-size:var(--bew-base-font-size)">{{ version }}</span>
      </SettingsItem>
      <SettingsItem title="项目地址">
        <a
          href="https://github.com/NB-Group/GuluGulu"
          target="_blank"
          style="color:var(--bew-theme-color);font-size:var(--bew-base-font-size);text-decoration:none"
        >
          GitHub
        </a>
      </SettingsItem>
    </SettingsItemGroup>
    <SettingsItemGroup title="致谢">
      <SettingsItem title="BewlyBewly" desc="本项目的设计灵感来源">
        <a
          href="https://github.com/BewlyBewly/BewlyBewly"
          target="_blank"
          style="color:var(--bew-theme-color);font-size:var(--bew-base-font-size);text-decoration:none"
        >
          访问项目
        </a>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>
