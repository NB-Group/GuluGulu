<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
</script>

<template>
  <div w="full" min-h="46px" p="y-8" flex="~" justify="center" items="center">
    <span v-html="renderIcon('line-md:loading-twotone-loop', 24)" style="display:contents" m="r-2" />
    <slot>
      <span text="$bew-text-2">加载中...</span>
    </slot>
  </div>
</template>
