<script lang="ts" setup>
import type { Ref } from 'vue'

interface Props {
  min?: number
  max?: number
  modelValue: number
  label: string
}
const props = withDefaults(defineProps<Props>(), { min: 0, max: 100 })
const emit = defineEmits(['update:modelValue'])

const modelValue = ref<number>(props.modelValue)
const rangeRef = ref<HTMLInputElement>() as Ref<HTMLInputElement>

function paint(el: HTMLInputElement, v: number) {
  const progress = (v - props.min) / (props.max - props.min) * 100
  el.style.background = `linear-gradient(to right, var(--bew-theme-color) ${progress}%, var(--bew-fill-1) ${progress}%) no-repeat`
}

function onInput() {
  const el = rangeRef.value!
  const v = Number(el.value)
  paint(el, v)
  emit('update:modelValue', v)
}

onMounted(() => {
  const el = rangeRef.value
  if (!el) return
  modelValue.value = props.modelValue
  paint(el, props.modelValue)
})
</script>

<template>
  <label cursor-pointer flex items-center gap-3 w="100%">
    <input
      ref="rangeRef"
      v-model="modelValue"
      type="range"
      :min="min"
      :max="max"
      class="slider"
      @input="onInput"
    >
    <span text="sm $bew-text-2" shrink-0>{{ label }}</span>
  </label>
</template>

<style lang="scss" scoped>
.slider {
  --s-track-h: 6px;
  --s-thumb-w: 18px;

  appearance: none;
  width: 100%;
  height: var(--s-thumb-w);
  margin: 0;
  padding: 0;
  // background is set entirely inline by JS — no CSS variable, no cascade fight
  background: var(--bew-fill-1);
  border-radius: 999px;
  outline: none;
  cursor: pointer;
  box-sizing: border-box;

  &::-webkit-slider-runnable-track {
    appearance: none;
    height: var(--s-track-h);
    background: transparent;
  }

  &::-webkit-slider-thumb {
    appearance: none;
    width: var(--s-thumb-w);
    height: var(--s-thumb-w);
    margin-top: calc((var(--s-track-h) - var(--s-thumb-w)) / 2);
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--bew-border-color);
    cursor: pointer;
    transition: box-shadow .2s;
  }
  &::-webkit-slider-thumb:hover {
    box-shadow: 0 0 0 2px var(--bew-theme-color);
  }

  &::-moz-range-track {
    height: var(--s-track-h);
    background: transparent;
    border: none;
  }

  &::-moz-range-thumb {
    appearance: none;
    width: var(--s-thumb-w);
    height: var(--s-thumb-w);
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--bew-border-color);
    cursor: pointer;
    border: none;
    transition: box-shadow .2s;
  }
  &::-moz-range-thumb:hover {
    box-shadow: 0 0 0 2px var(--bew-theme-color);
  }
}
</style>
