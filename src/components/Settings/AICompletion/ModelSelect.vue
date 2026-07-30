<script setup lang="ts">
/**
 * 从统一模型池(aiModels)里选一个模型的下拉。薄封装 Select,
 * 各 AI 模块复用:代码补全 / 思路指引 都用它挑 modelId。
 */
import { settings } from '~/logic'

const props = defineProps<{ modelValue: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [string | null] }>()

const value = computed({
  get: () => props.modelValue,
  set: (v: any) => emit('update:modelValue', (v ?? null) as string | null),
})

const options = computed(() => [
  { label: '未选择', value: null },
  ...settings.value.aiModels.map(m => ({ label: m.name || m.modelName || '(未命名)', value: m.id })),
])
</script>

<template>
  <Select v-model="value" :options="options" w="full" />
</template>
