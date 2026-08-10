<script setup lang="ts">
import { useGuluApp } from '~/composables/useAppProvider'

defineProps<{
  modelValue?: string | number | null
  placeholder?: string
  disabled?: boolean
  options?: { label: string, value: string | number | null }[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number | null): void
}>()

// Teleport 到 app 根(mainAppRef,shadow 内无 transform 的容器),逃出设置弹窗等
// 带 transform 的祖先 —— 否则 position:fixed 会被它们当成包含块,坐标错位/滚动漂移。
// 无 provider(popup/options 等场景)则降级为原地渲染。
const mainAppRef = (() => {
  try { return useGuluApp().mainAppRef }
  catch { return undefined }
})()

const open = ref(false)
const dropdownRef = ref<HTMLDivElement>()
const triggerRef = ref<HTMLButtonElement>()
const dropdownStyle = ref<Record<string, string>>({})

function updatePosition() {
  if (!triggerRef.value)
    return
  const rect = triggerRef.value.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  const need = 220 // 下拉期望高度
  const style: Record<string, string> = {
    position: 'fixed',
    width: `${rect.width}px`,
    left: `${rect.left}px`,
  }
  // 下方放不下且上方更宽裕 → 翻到触发器上方(修复靠近视口底部的下拉找不到的问题)
  if (spaceBelow < need && spaceAbove > spaceBelow)
    style.bottom = `${window.innerHeight - rect.top + 4}px`
  else
    style.top = `${rect.bottom + 4}px`
  dropdownStyle.value = style
}
function toggleOpen() {
  open.value = !open.value
  if (open.value)
    updatePosition()
}

function select(value: string | number | null) {
  emit('update:modelValue', value)
  open.value = false
}

function closeIfOutside(e: MouseEvent) {
  const path = e.composedPath()
  if (triggerRef.value && path.includes(triggerRef.value))
    return // 点的是触发器,交给 toggleOpen
  if (dropdownRef.value && !path.includes(dropdownRef.value))
    open.value = false
}

onMounted(() => {
  document.addEventListener('click', closeIfOutside)
  // capture=true:捕获设置面板内 OverlayScrollbars 等任意滚动容器的滚动,实时重算位置
  window.addEventListener('scroll', () => { if (open.value) updatePosition() }, true)
  window.addEventListener('resize', () => { if (open.value) updatePosition() })
})
onBeforeUnmount(() => {
  document.removeEventListener('click', closeIfOutside)
})
</script>

<template>
  <div ref="dropdownRef" class="g-select-wrapper" relative>
    <button
      ref="triggerRef"
      class="g-select-trigger"
      :class="{ open, disabled }"
      :disabled="disabled"
      @click="toggleOpen"
    >
      <span v-if="modelValue" class="selected-text">
        {{ options?.find(o => o.value === modelValue)?.label || modelValue }}
      </span>
      <span v-else class="placeholder">{{ placeholder || '请选择' }}</span>
      <span class="arrow" v-html="'▾'" />
    </button>
    <Teleport :to="mainAppRef" :disabled="!mainAppRef">
      <Transition name="dropdown">
        <div v-if="open && !disabled" class="g-select-dropdown" :style="dropdownStyle" @click.stop>
          <div
            v-for="option in options"
            :key="option.value === null ? '__null__' : option.value"
            class="g-select-option"
            :class="{ active: modelValue === option.value }"
            @click="select(option.value)"
          >
            {{ option.label }}
          </div>
          <slot />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.g-select-wrapper {
  width: 100%;
}

.g-select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bew-content);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  color: var(--bew-text-1);
  font-size: var(--bew-base-font-size);
  cursor: pointer;
  transition: all var(--bew-dur-fast) ease;
  backdrop-filter: var(--bew-filter-glass-1);
  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);

  &:hover:not(.disabled) {
    border-color: var(--bew-theme-color-40);
  }
  &.open {
    border-color: var(--bew-theme-color);
    box-shadow: 0 0 0 2px var(--bew-theme-color-30);
  }
  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .placeholder {
    color: var(--bew-text-4);
  }
  .arrow {
    font-size: 0.7em;
    color: var(--bew-text-3);
    transition: transform var(--bew-dur-fast) ease;
  }
  &.open .arrow {
    transform: rotate(180deg);
  }
}

.g-select-dropdown {
  max-height: 240px;
  overflow-y: auto;
  background: var(--bew-content);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  box-shadow: var(--bew-shadow-2);
  z-index: 99999;
  backdrop-filter: var(--bew-filter-glass-2);
}

.g-select-option {
  padding: 8px 12px;
  font-size: var(--bew-base-font-size);
  color: var(--bew-text-1);
  cursor: pointer;
  transition: background var(--bew-dur-fast) ease;

  &:hover {
    background: var(--bew-fill-2);
  }
  &.active {
    background: var(--bew-theme-color-20);
    color: var(--bew-theme-color);
    font-weight: 600;
    box-shadow: inset 2px 0 0 var(--bew-theme-color);
  }
}

.dropdown-enter-active {
  transition:
    opacity var(--bew-dur-fast) ease,
    transform var(--bew-dur-fast) ease;
}
.dropdown-leave-active {
  transition:
    opacity var(--bew-dur-fast) ease,
    transform var(--bew-dur-fast) ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
