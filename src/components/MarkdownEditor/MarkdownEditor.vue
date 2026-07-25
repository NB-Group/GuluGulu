<script setup lang="ts">
/**
 * 项目风格的 Markdown 编辑器:工具栏(加粗/斜体/代码/引用/列表/链接/图片/标题)+ 编辑区,
 * 可切「预览」用与项目一致的 markdown 渲染。v-model 双向绑定纯文本。
 * 复用于:个人简介、讨论/专栏发帖等所有写 markdown 的地方。
 */
import { parseMarkdownContent } from '~/utils/markdown'
import { renderIcon } from '~/utils/icons'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  rows?: number
}>(), { placeholder: '支持 Markdown', rows: 8 })

const emit = defineEmits<{ 'update:modelValue': [string] }>()
const value = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})
const ta = ref<HTMLTextAreaElement | null>(null)
const showPreview = ref(false)
const preview = computed(() => parseMarkdownContent(value.value || ''))

/** 包裹选区:前后插入标记 */
function wrap(before: string, after = before, placeholder = '') {
  const el = ta.value
  if (!el)
    return
  const s = el.selectionStart
  const e = el.selectionEnd
  const sel = value.value.slice(s, e) || placeholder
  value.value = value.value.slice(0, s) + before + sel + after + value.value.slice(e)
  nextTick(() => {
    el.focus()
    el.setSelectionRange(s + before.length, s + before.length + sel.length)
  })
}
/** 行首加前缀(引用/列表/标题) */
function linePrefix(prefix: string) {
  const el = ta.value
  if (!el)
    return
  const s = el.selectionStart
  const lineStart = value.value.lastIndexOf('\n', s - 1) + 1
  value.value = value.value.slice(0, lineStart) + prefix + value.value.slice(lineStart)
  nextTick(() => el.focus())
}

const tools = [
  { icon: 'mingcute:bold-line', title: '加粗', act: () => wrap('**', '**', '加粗') },
  { icon: 'mingcute:italic-line', title: '斜体', act: () => wrap('*', '*', '斜体') },
  { icon: 'mingcute:code-line', title: '行内代码', act: () => wrap('`', '`', 'code') },
  { icon: 'mingcute:terminal-line', title: '代码块', act: () => wrap('\n```\n', '\n```\n', '代码') },
  { icon: 'mingcute:font-line', title: '标题', act: () => linePrefix('## ') },
  { icon: 'mingcute:quote-left-line', title: '引用', act: () => linePrefix('> ') },
  { icon: 'mingcute:list-check-line', title: '无序列表', act: () => linePrefix('- ') },
  { icon: 'mingcute:link-line', title: '链接', act: () => wrap('[', '](https://)', '文本') },
  { icon: 'mingcute:pic-line', title: '图片', act: () => wrap('![', '](https://)', '图片') },
] as const
</script>

<template>
  <div class="md-editor">
    <div class="md-toolbar" flex="~ items-center gap-0.5 wrap">
      <button
        v-for="t in tools" :key="t.icon" type="button" class="md-tool"
        :title="t.title" @click="t.act"
      >
        <span style="display:contents" v-html="renderIcon(t.icon, 16)" />
      </button>
      <span flex-1 />
      <button
        type="button" class="md-tool" :class="{ active: showPreview }"
        title="切换预览" @click="showPreview = !showPreview"
      >
        <span style="display:contents" v-html="renderIcon(showPreview ? 'mingcute:edit-line' : 'mingcute:eye-line', 16)" />
        {{ showPreview ? '编辑' : '预览' }}
      </button>
    </div>
    <textarea
      v-show="!showPreview" ref="ta" v-model="value" class="md-textarea"
      :placeholder="placeholder" :rows="rows" spellcheck="false"
    />
    <div v-show="showPreview" class="md-preview markdown-body" :style="{ minHeight: `${(props.rows) * 1.6}em` }">
      <span v-if="!value" style="color:var(--bew-text-4)"> nothing </span>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <span v-else v-html="preview" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.md-editor {
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  overflow: hidden;
  background: var(--bew-fill-1);
  transition: border-color var(--bew-dur-fast);
  &:focus-within { border-color: var(--bew-theme-color-40); }
}
.md-toolbar {
  padding: 4px 6px;
  border-bottom: 1px solid var(--bew-border-color);
  background: var(--bew-fill-2);
}
.md-tool {
  display: inline-flex; align-items: center; gap: 3px;
  height: 28px; padding: 0 8px;
  border: none; background: transparent; cursor: pointer;
  color: var(--bew-text-3); font-size: .8em; font-weight: 600;
  border-radius: var(--bew-radius-half); white-space: nowrap;
  transition: all var(--bew-dur-fast);
  &:hover { background: var(--bew-fill-3); color: var(--bew-text-1); }
  &.active { background: var(--bew-theme-color-20); color: var(--bew-theme-color); }
}
.md-textarea {
  display: block; width: 100%; box-sizing: border-box;
  border: none; outline: none; resize: vertical;
  padding: 10px 12px;
  background: transparent;
  color: var(--bew-text-1);
  font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace;
  font-size: var(--bew-base-font-size);
  line-height: 1.7;
}
.md-preview {
  padding: 10px 14px;
  color: var(--bew-text-1);
  font-size: var(--bew-base-font-size);
  line-height: 1.7;
  background: var(--bew-content);
}
</style>
