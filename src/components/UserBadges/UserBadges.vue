<script setup lang="ts">
/**
 * 用户名右边的徽章组:
 *  1. 洛谷原生徽章(user.badge)—— 颜色跟用户名/等级同色(由 :color 传入解析后的 CSS 色)。
 *  2. GuluGulu 开发者徽章 —— 对特定用户名特判,金色渐变,彰显尊贵地位。
 * 用法:<UserBadges :name="u.name" :luogu-badge="u.badge" :color="colorVar(u.color)" />
 */
const props = defineProps<{
  name?: string | number
  luoguBadge?: string | null
  /** 已解析的 CSS 颜色(与用户名同色),如 var(--bew-red) / #fe4d61 */
  color?: string
}>()

// GuluGulu 开发者(按用户名特判,要加人改这里)
const DEV_NAMES = ['NB_Group', '782', 'shu123']
const isDev = computed(() => DEV_NAMES.includes(String(props.name ?? '')))
const hasAny = computed(() => !!props.luoguBadge || isDev.value)
</script>

<template>
  <span v-if="hasAny" class="user-badges" flex="~ inline items-center gap-1">
    <span
      v-if="luoguBadge" class="ub-luogu"
      :style="{ color: color || 'var(--bew-text-2)' }"
    >{{ luoguBadge }}</span>
    <span v-if="isDev" class="ub-dev" title="GuluGulu 开发者">GuluGulu开发者</span>
  </span>
</template>

<style lang="scss" scoped>
.user-badges { margin-left: 6px; vertical-align: middle; }
.ub-luogu {
  display: inline-block;
  font-size: 0.7em;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  line-height: 1.4;
  white-space: nowrap;
  // 用 currentColor 派生半透明底/边(currentColor = 内联 color = 用户名同色)
  background: color-mix(in srgb, currentColor 14%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 42%, transparent);
}
.ub-dev {
  display: inline-block;
  font-size: 0.68em;
  font-weight: 800;
  padding: 1px 8px;
  border-radius: 999px;
  color: #fff;
  white-space: nowrap;
  letter-spacing: 0.02em;
  background: linear-gradient(135deg, #f7b955, #ff8a3d);
  box-shadow: 0 1px 4px rgba(247, 185, 85, 0.45);
}
</style>
