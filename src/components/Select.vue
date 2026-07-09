<script setup lang="ts">
defineProps<{
  modelValue?: string | number | null
  placeholder?: string
  disabled?: boolean
  options?: { label: string, value: string | number | null }[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number | null): void
}>()

const open = ref(false)
const dropdownRef = ref<HTMLDivElement>()

function select(value: string | number) {
  emit('update:modelValue', value)
  open.value = false
}

function toggleOpen() { open.value = !open.value }

// Close on outside click
onMounted(() => {
  document.addEventListener('click', (e) => {
    if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) open.value = false
  })
})
</script>

<template>
  <div ref="dropdownRef" class="g-select-wrapper" relative>
    <button
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
    <Transition name="dropdown">
      <div v-if="open && !disabled" class="g-select-dropdown">
        <div
          v-for="option in options"
          :key="option.value"
          class="g-select-option"
          :class="{ active: modelValue === option.value }"
          @click="select(option.value)"
        >{{ option.label }}</div>
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.g-select-wrapper { width: 100%; }

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
  transition: all .2s ease;
  backdrop-filter: var(--bew-filter-glass-1);
  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);

  &:hover:not(.disabled) { border-color: var(--bew-theme-color-40); }
  &.open { border-color: var(--bew-theme-color); box-shadow: 0 0 0 2px var(--bew-theme-color-30); }
  &.disabled { opacity: .5; cursor: not-allowed; }

  .placeholder { color: var(--bew-text-4); }
  .arrow { font-size: .7em; color: var(--bew-text-3); transition: transform .2s ease; }
  &.open .arrow { transform: rotate(180deg); }
}

.g-select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  max-height: 240px;
  overflow-y: auto;
  background: var(--bew-content);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  box-shadow: var(--bew-shadow-2);
  z-index: 1000;
  backdrop-filter: var(--bew-filter-glass-2);
}

.g-select-option {
  padding: 8px 12px;
  font-size: var(--bew-base-font-size);
  color: var(--bew-text-1);
  cursor: pointer;
  transition: background .1s ease;

  &:hover { background: var(--bew-fill-2); }
  &.active { background: var(--bew-theme-color-20); color: var(--bew-theme-color); font-weight: 600; }
}

.dropdown-enter-active { transition: opacity .15s ease, transform .15s ease; }
.dropdown-leave-active { transition: opacity .1s ease, transform .1s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
