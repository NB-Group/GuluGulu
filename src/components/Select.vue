<script setup lang="ts">
defineProps<{
  modelValue?: string | number
  placeholder?: string
  disabled?: boolean
  options?: { label: string, value: string | number }[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
}>()

function handleChange(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <select
    class="g-select"
    :value="modelValue"
    :disabled="disabled"
    style="
      backdrop-filter: var(--bew-filter-glass-1);
      box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
    "
    w-full
    p="x-4 y-2"
    rounded="$bew-radius"
    text="$bew-text-1"
    bg="$bew-content"
    border="1 $bew-border-color focus:$bew-theme-color"
    outline="none focus:$bew-theme-color-30"
    transition="all duration-300"
    cursor="pointer"
    @change="handleChange"
  >
    <option v-if="placeholder" value="" disabled selected>{{ placeholder }}</option>
    <slot>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :selected="modelValue === option.value"
      >
        {{ option.label }}
      </option>
    </slot>
  </select>
</template>

<style lang="scss" scoped>
.g-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 2rem;

  &:disabled {
    --uno: "opacity-50 cursor-not-allowed";
  }

  &:focus {
    box-shadow:
      0 0 0 2px var(--bew-theme-color),
      0 4px 12px var(--bew-theme-color-40),
      var(--bew-shadow-edge-glow-1);
  }
}
</style>
