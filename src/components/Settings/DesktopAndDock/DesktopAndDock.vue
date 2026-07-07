<script lang="ts" setup>
import { settings } from '~/logic'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const dockPositionOptions = computed(() => [
  { label: '左侧', value: 'left' },
  { label: '右侧', value: 'right' },
  { label: '底部', value: 'bottom' },
])
</script>

<template>
  <div>
    <SettingsItemGroup title="导航坞 (Dock)">
      <SettingsItem title="始终使用导航坞" desc="在所有页面显示导航坞（而非仅首页）">
        <Radio v-model="settings.alwaysUseDock" />
      </SettingsItem>

      <SettingsItem title="导航坞位置" desc="选择导航坞的停靠位置">
        <Select v-model="settings.dockPosition" :options="dockPositionOptions" w="full" />
      </SettingsItem>

      <SettingsItem title="自动隐藏导航坞" desc="无操作时自动隐藏导航坞">
        <Radio v-model="settings.autoHideDock" />
      </SettingsItem>

      <SettingsItem title="半隐藏导航坞" desc="仅显示图标，悬停时展开">
        <Radio v-model="settings.halfHideDock" />
      </SettingsItem>

      <SettingsItem title="禁用导航坞辉光效果" desc="关闭深色模式按钮的月光辉光动画">
        <Radio v-model="settings.disableDockGlowingEffect" />
      </SettingsItem>

      <SettingsItem title="禁用深浅色切换按钮" desc="从导航坞中移除深浅色模式切换按钮">
        <Radio v-model="settings.disableLightDarkModeSwitcherOnDock" />
      </SettingsItem>

      <SettingsItem title="分离返回顶部和刷新按钮">
        <Radio v-model="settings.backToTopAndRefreshButtonsAreSeparated" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
