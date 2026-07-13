<script lang="ts" setup>
interface Props {
  type?: | 'default'
    | 'primary'
    | 'secondary'
    | 'tertiary'
    | 'info'
    | 'success'
    | 'warning'
    | 'error'
  size?: 'small' | 'medium' | 'large'
  color?: string
  textColor?: string
  strong?: boolean
  round?: boolean
  block?: boolean
  center?: boolean
  disabled?: boolean
  loading?: boolean
}

defineProps<Props>()

const emit = defineEmits(['click'])

function handleClick(evt: MouseEvent) {
  emit('click', evt)
}
</script>

<template>
  <button
    class="b-button"
    :class="[
      `b-button--type-${type ?? 'default'}`,
      `b-button--size-${size ?? 'medium'}`,
      `${strong ? 'b-button--strong' : ''}`,
      `${color || textColor ? 'b-button--custom-color' : ''}`,
    ]"
    :style="{
      'backgroundColor': color,
      'color': textColor,
      '--b-button-radius': round ? '50px' : '',
      'width': block ? '100%' : 'var(--b-button-width)',
      'justifyContent': center ? 'center' : '',
    }"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <div v-if="loading" i-line-md:loading-twotone-loop text="$b-button-icon-size" />
    <slot v-else name="left" />
    <slot />
    <slot name="right" />
  </button>
</template>

<style lang="scss" scoped>
.b-button {
  --b-button-color: var(--bew-content-solid);
  --b-button-color-hover: var(--bew-content-solid-hover);
  --b-button-text-color: var(--bew-text-1);
  --b-button-radius: var(--bew-radius);
  --b-button-padding: 14px;
  --b-button-font-size: var(--bew-base-font-size);
  --b-button-icon-size: 15px;
  --b-button-width: fit-content;
  --b-button-height: 35px;
  --b-button-border-width: 0px;
  --b-button-border-color: var(--bew-border-color);
  --b-button-shadow: none;
  --b-button-shadow-hover: var(--b-button-shadow);
  --b-button-shadow-active: var(--b-button-shadow);

  --uno: "bg-$b-button-color hover:bg-$b-button-color-hover box-border";
  --uno: "rounded-$b-button-radius p-x-$b-button-padding transform-gpu active:scale-95";
  --uno: "duration-300 flex items-center gap-2 text-size-$b-button-font-size";
  --uno: "text-$b-button-text-color lh-$b-button-height h-$b-button-height";
  --uno: "border-solid border-width-$b-button-border-width border-$b-button-border-color";
  --uno: "shadow-$b-button-shadow hover:shadow-$b-button-shadow-hover active:shadow-$b-button-shadow-active";
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }

  & svg {
    --uno: "text-size-$b-button-icon-size";
  }

  &--type-primary {
    --b-button-color: var(--bew-theme-color);
    --b-button-color-hover: var(--bew-theme-color-80);
    --b-button-text-color: white;
  }

  &--type-secondary {
    --b-button-color: var(--bew-fill-1);
    --b-button-color-hover: var(--bew-fill-2);
    --b-button-text-color: var(--bew-text-1);
  }

  &--type-tertiary {
    --b-button-color: transparent;
    --b-button-color-hover: var(--bew-fill-2);
    --b-button-text-color: var(--bew-text-1);
  }

  &--type-info {
    --b-button-color: var(--bew-info-color);
    --b-button-color-hover: var(--bew-info-color-80);
    --b-button-text-color: white;
  }

  &--type-success {
    --b-button-color: var(--bew-success-color);
    --b-button-color-hover: var(--bew-success-color-80);
    --b-button-text-color: white;
  }

  &--type-warning {
    --b-button-color: var(--bew-warning-color);
    --b-button-color-hover: var(--bew-warning-color-80);
    --b-button-text-color: white;
  }

  &--type-error {
    --b-button-color: var(--bew-error-color);
    --b-button-color-hover: var(--bew-error-color-80);
    --b-button-text-color: white;
  }

  &--size-small {
    --b-button-padding: 12px;
    --b-button-font-size: 12px;
    --b-button-icon-size: 13px;
    --b-button-height: 30px;
  }

  &--size-large {
    --b-button-padding: 12px;
    --b-button-font-size: 15px;
    --b-button-icon-size: 16px;
    --b-button-height: 40px;
  }

  &--custom-color {
    --uno: "hover:opacity-70";
  }

  &--strong {
    --uno: "fw-800";
  }
}
</style>
