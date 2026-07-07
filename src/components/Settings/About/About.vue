<script setup lang="ts">
import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
</script>

<template>
  <div flex="~ col gap-4">
    <SettingsItemGroup title="关于 GulyGuly">
      <SettingsItem title="版本" desc="当前扩展版本">
        <span text="$bew-text-2">0.1.0</span>
      </SettingsItem>
      <SettingsItem title="项目地址">
        <a
          href="https://github.com/nbgroup/GulyGuly"
          target="_blank"
          text="$bew-theme-color"
          hover="underline"
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
          text="$bew-theme-color"
          hover="underline"
        >
          访问项目
        </a>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>
