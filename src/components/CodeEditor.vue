<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { LuoguLanguage } from '~/utils/luogu-api'
import { useCodeMirror } from '~/composables/useCodeMirror'

const props = defineProps<{
  languages: LuoguLanguage[]
  modelValue: string
  lang: number
  enableO2: boolean
  showO2: boolean
  loading?: boolean
  disabled?: boolean
  error?: string
  result?: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:lang': [value: number]
  'update:enableO2': [value: boolean]
  submit: []
}>()

// CodeMirror host + a local code ref two-way synced with modelValue.
const host = ref<HTMLElement>()
const code = ref(props.modelValue)
const aceMode = computed(() => props.languages.find(l => l.id === props.lang)?.aceMode || 'plain_text')

const editor = useCodeMirror({ host, value: code, lang: aceMode })

defineExpose({
  highlightLines: (lines: number[]) => editor.highlightLines(lines),
  clearHighlights: () => editor.clearHighlights(),
  jumpToLine: (n: number) => editor.jumpToLine(n),
})

// parent -> local (load lastCode / reset) without echo loop
watch(() => props.modelValue, v => { if (v !== code.value) code.value = v })
// local (CM edits) -> parent
watch(code, v => { if (v !== props.modelValue) emit('update:modelValue', v) })
</script>

<template>
  <div class="code-editor-wrapper">
    <!-- Language + O2 selector -->
    <div flex="~ col md:row gap-4" mb-4 items="end">
      <div flex="~ col gap-1" flex-1>
        <label text="sm $bew-text-2" fw-bold mb-1>编程语言</label>
        <select
          :value="lang"
          class="lang-select"
          bg="$bew-fill-1" rounded="$bew-radius-half" p="x-3 y-2"
          border="1 $bew-border-color" text="sm $bew-text-1"
          outline-none cursor-pointer
          style="backdrop-filter: var(--bew-filter-glass-1)"
          @change="emit('update:lang', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="l in languages" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
      </div>

      <label
        v-if="showO2"
        flex="~ items-center gap-2" cursor-pointer
        p="x-3 y-2" rounded="$bew-radius-half"
        bg="$bew-fill-1" border="1 $bew-border-color"
      >
        <input type="checkbox" :checked="enableO2" @change="emit('update:enableO2', ($event.target as HTMLInputElement).checked)" />
        <span text="sm $bew-text-2">开启 O2 优化</span>
      </label>
    </div>

    <!-- CodeMirror editor -->
    <div mb-4>
      <div ref="host" class="code-area-cm"></div>
    </div>

    <!-- Submit button + messages -->
    <div flex="~ col gap-3">
      <div flex="~ items-center gap-3">
        <Button type="primary" :loading="loading" :disabled="disabled || loading" @click="emit('submit')">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          {{ loading ? '提交中...' : '提交代码' }}
        </Button>

        <span v-if="result" text="sm" style="color: var(--bew-success-color)" fw-bold>{{ result }}</span>
      </div>

      <div v-if="error" p-3 rounded="$bew-radius" style="background: var(--bew-error-color-20); color: var(--bew-error-color); font-size: var(--bew-base-font-size);">
        {{ error }}
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.code-area-cm {
  height: 360px;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  overflow: hidden;
  background: var(--bew-fill-1);
  &:focus-within { border-color: var(--bew-theme-color); box-shadow: 0 0 0 2px var(--bew-theme-color-20); }
}
.lang-select:focus { border-color: var(--bew-theme-color); }
</style>
