<script lang="ts" setup>
interface Props {
  min?: number
  max?: number
  modelValue: number
  label: string
}
const props = withDefaults(defineProps<Props>(), { min: 0, max: 100 })
const emit = defineEmits(['update:modelValue'])

const val = ref(props.modelValue)
const sliderRef = ref<HTMLInputElement>()

function updateFill(v: number) {
  const el = sliderRef.value
  if (!el) return
  const pct = ((v - props.min) / (props.max - props.min)) * 100
  el.style.background = `linear-gradient(to right, var(--bew-theme-color) ${pct}%, var(--bew-fill-1) ${pct}%)`
}

function onInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  val.value = v
  emit('update:modelValue', v)
  updateFill(v)
}

onMounted(() => {
  val.value = props.modelValue
  nextTick(() => updateFill(props.modelValue))
})

watch(() => props.modelValue, (v) => {
  val.value = v
  updateFill(v)
})
</script>

<template>
  <label cursor-pointer flex items-center gap-3 w="100%">
    <input
      ref="sliderRef"
      v-model="val" type="range" :min="min" :max="max" class="slider"
      @input="onInput"
    >
    <span text="sm $bew-text-2" shrink-0>{{ label }}</span>
  </label>
</template>

<style lang="scss" scoped>
input[type="range"] {
  appearance: none;
  outline: none;
  width: 100%;
  height: 10px;
  border-radius: 5px;
  border: 2px solid var(--bew-border-color);

  &::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--bew-border-color);
    cursor: pointer;
    transition: box-shadow .2s;
  }
  &::-webkit-slider-thumb:hover {
    box-shadow: 0 0 0 2px var(--bew-theme-color);
  }

  &::-moz-range-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
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

  &::-moz-range-track {
    height: 10px;
    border-radius: 5px;
    background: transparent;
  }
}
</style>
