<script lang="ts" setup>
interface Props {
  min?: number
  max?: number
  modelValue: number
  label: string
}
const props = withDefaults(defineProps<Props>(), { min: 0, max: 100 })
const emit = defineEmits(['update:modelValue'])

const sliderRef = ref<HTMLInputElement>()

function pct(v: number) {
  return ((v - props.min) / (props.max - props.min)) * 100
}

function applyFill(v: number) {
  const el = sliderRef.value
  if (!el) return
  const p = pct(v)
  el.style.setProperty('--s-pct', `${p}%`)
}

function onInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  emit('update:modelValue', v)
  applyFill(v)
}

onMounted(() => nextTick(() => applyFill(props.modelValue)))
watch(() => props.modelValue, v => applyFill(v))
</script>

<template>
  <label cursor-pointer flex items-center gap-3 w="100%">
    <input
      ref="sliderRef"
      type="range"
      :min="min"
      :max="max"
      :value="modelValue"
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
  --s-pct: 0%;

  appearance: none;
  width: 100%;
  height: var(--s-thumb-w);
  margin: 0;
  padding: 0;
  background: linear-gradient(
    to right,
    var(--bew-theme-color) 0%,
    var(--bew-theme-color) var(--s-pct),
    var(--bew-fill-1) var(--s-pct),
    var(--bew-fill-1) 100%
  );
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
