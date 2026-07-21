<script lang="ts" setup>
import { settings } from '~/logic'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const gridLayoutOptions = computed(() => [
  { label: '自适应', value: 'adaptive' },
  { label: '双列', value: 'twoColumn' },
  { label: '单列', value: 'singleColumn' },
])

const searchBarModeOptions = computed(() => [
  { label: '当前标签页', value: 'currentTab' },
  { label: '新标签页', value: 'newTab' },
])
</script>

<template>
  <div>
    <SettingsItemGroup title="通用">
      <SettingsItem title="默认网格布局" desc="⚠️ 暂未实现 · 字段已保留，UI 选择不会生效">
        <Select v-model="settings.gridLayout" :options="gridLayoutOptions" w="full" />
      </SettingsItem>

      <SettingsItem title="搜索栏行为" desc="⚠️ 暂未实现 · 字段已保留，UI 选择不会生效">
        <Select v-model="settings.searchBarMode" :options="searchBarModeOptions" w="full" />
      </SettingsItem>

      <SettingsItem title="始终显示顶栏">
        <Radio v-model="settings.showTopBar" />
      </SettingsItem>

      <SettingsItem title="顶栏自动隐藏" desc="向下滚动时自动隐藏顶栏">
        <Radio v-model="settings.topBarAutoHide" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup title="字体">
      <SettingsItem title="基础字体大小" desc="调整全局字体大小">
        <Slider v-model="settings.baseFontSize" :min="12" :max="20" :label="`${settings.baseFontSize}px`" />
      </SettingsItem>

      <SettingsItem title="页面最大宽度" desc="限制内容区域的最大宽度">
        <Slider v-model="settings.pageMaxWidth" :min="1200" :max="3200" :label="`${settings.pageMaxWidth}px`" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup title="性能">
      <SettingsItem title="禁用毛玻璃效果" desc="关闭毛玻璃可提升低配设备性能">
        <Radio v-model="settings.disableFrostedGlass" />
      </SettingsItem>
      <SettingsItem
        v-if="!settings.disableFrostedGlass"
        title="降低毛玻璃模糊强度"
        desc="减少模糊可提升性能"
      >
        <Radio v-model="settings.reduceFrostedGlassBlur" />
      </SettingsItem>
      <SettingsItem title="禁用阴影" desc="⚠️ 暂未实现 · 字段已保留，开关不会生效">
        <Radio v-model="settings.disableShadow" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
