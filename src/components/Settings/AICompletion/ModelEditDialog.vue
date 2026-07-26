<script setup lang="ts">
/**
 * 添加/编辑一个 AI 模型条目(name / baseUrl / apiKey / modelName)。
 * 用项目 Dialog(Enter 确认 / Esc 取消)。emit confirm 时回吐表单。
 */
import Dialog from '~/components/Dialog.vue'

const props = defineProps<{
  visible: boolean
  /** 传入即「编辑」模式,预填;不传即「添加」 */
  initial?: { id?: string, name?: string, baseUrl?: string, apiKey?: string, modelName?: string } | null
}>()
const emit = defineEmits<{
  'update:visible': [boolean]
  /** id 为空=新增,否则=编辑该 id */
  confirm: [{ id?: string, name: string, baseUrl: string, apiKey: string, modelName: string }]
}>()

const name = ref('')
const baseUrl = ref('')
const apiKey = ref('')
const modelName = ref('')

watch(() => props.visible, (v) => {
  if (v) {
    name.value = props.initial?.name ?? ''
    baseUrl.value = props.initial?.baseUrl ?? ''
    apiKey.value = props.initial?.apiKey ?? ''
    modelName.value = props.initial?.modelName ?? ''
  }
}, { immediate: true })

function onConfirm() {
  if (!name.value.trim() && !modelName.value.trim())
    return
  emit('confirm', {
    id: props.initial?.id,
    name: name.value.trim() || modelName.value.trim(),
    baseUrl: baseUrl.value.trim(),
    apiKey: apiKey.value.trim(),
    modelName: modelName.value.trim(),
  })
}
</script>

<template>
  <Dialog
    :visible="visible"
    :title="initial?.id ? '编辑模型' : '添加模型'"
    desc="OpenAI 兼容端点。密钥仅存本地、随请求发出。"
    width="460"
    @update:visible="(v: boolean) => emit('update:visible', v)"
    @confirm="onConfirm"
  >
    <div flex="~ col gap-3" py-2>
      <label flex="~ col gap-1">
        <span text="sm $bew-text-2">名称</span>
        <Input v-model="name" w-full placeholder="DeepSeek V3" />
      </label>
      <label flex="~ col gap-1">
        <span text="sm $bew-text-2">Base URL</span>
        <Input v-model="baseUrl" w-full placeholder="https://api.deepseek.com/v1" />
      </label>
      <label flex="~ col gap-1">
        <span text="sm $bew-text-2">API Key</span>
        <Input v-model="apiKey" type="password" w-full placeholder="sk-..." />
      </label>
      <label flex="~ col gap-1">
        <span text="sm $bew-text-2">模型名</span>
        <Input v-model="modelName" w-full placeholder="deepseek-chat" />
      </label>
    </div>
  </Dialog>
</template>
