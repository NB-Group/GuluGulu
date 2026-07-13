<script setup lang="ts">
defineProps<{
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  type?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <input
    class="g-input"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :type="type ?? 'text'"
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
    @input="handleInput"
  >
</template>

<style lang="scss" scoped>
.g-input {
  &:disabled {
    --uno: "opacity-50 cursor-not-allowed";
  }

  &::placeholder {
    --uno: "text-$bew-text-3";
  }

  &:focus {
    box-shadow:
      0 0 0 2px var(--bew-theme-color),
      0 4px 12px var(--bew-theme-color-40),
      var(--bew-shadow-edge-glow-1);
  }
}
</style>
