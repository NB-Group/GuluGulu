import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { bracketMatching, defaultHighlightStyle, indentUnit, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { pascal } from '@codemirror/legacy-modes/mode/pascal'
import { search, searchKeymap } from '@codemirror/search'
import type { Extension } from '@codemirror/state'
import { Compartment, EditorState } from '@codemirror/state'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view'
import { onUnmounted, type Ref, ref, watch } from 'vue'

// aceMode -> CodeMirror 语言扩展(洛谷 LUOGU_LANGUAGES[i].aceMode)
const LANG_EXT: Record<string, () => Extension> = {
  c_cpp: () => cpp(),
  python: () => python(),
  java: () => java(),
  javascript: () => javascript(),
  pascal: () => StreamLanguage.define(pascal),
  plain_text: () => [],
}

// 编辑器外观基于 --bew-* 变量(随 .dark 自动切换 bg/fg/gutter)
const baseTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--bew-fill-1)', color: 'var(--bew-text-1)', height: '100%', fontSize: '14px' },
  '.cm-scroller': { fontFamily: 'Cascadia Code,Fira Code,JetBrains Mono,Consolas,monospace', lineHeight: '1.65' },
  '.cm-content': { padding: '8px 12px' },
  '.cm-gutters': { backgroundColor: 'var(--bew-fill-1)', color: 'var(--bew-text-4)', border: 'none' },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-selectionBackground, ::selection': { background: 'var(--bew-theme-color-30)' },
})

/**
 * 在给定宿主元素上挂载一个 CodeMirror 6 编辑器,与 `value` 双向绑定,
 * 跟随 `lang`(aceMode)切换语言、跟随系统深浅色切换语法高亮主题。
 *
 * host 通常在 `v-if` 内,故用 `watch(host)`(flush:post)管理生命周期:
 * 出现即 `new EditorView`,消失即 `destroy()`——`onMounted` 抓不到 v-if 延迟出现的宿主。
 */
export function useCodeMirror(opts: {
  host: Ref<HTMLElement | undefined>
  value: Ref<string>
  lang: Ref<string>
}) {
  let view: EditorView | null = null
  const langComp = new Compartment()
  const themeComp = new Compartment()
  const isDark = ref(document.documentElement.classList.contains('dark'))
  let darkObs: MutationObserver | null = null

  const langExtension = () => (LANG_EXT[opts.lang.value] || LANG_EXT.plain_text)()
  const themeExtension = () => [
    syntaxHighlighting(isDark.value ? oneDarkHighlightStyle : defaultHighlightStyle),
    // CM6 光标色由 caret-color 驱动(并非 borderLeftColor),显式随深浅切换 + 加粗到 2px
    EditorView.theme({
      '&': { caretColor: isDark.value ? '#f0f0f0' : '#1f1f1f' },
      '& .cm-cursor, & .cm-dropCursor': { borderLeftColor: isDark.value ? '#f0f0f0' : '#1f1f1f', borderLeftWidth: '2px' },
    }),
  ]

  function create(el: HTMLElement) {
    if (view)
      destroy()
    view = new EditorView({
      state: EditorState.create({
        doc: opts.value.value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          closeBrackets(),
          bracketMatching(),
          search({ top: true }),
          indentUnit.of('    '),
          EditorState.tabSize.of(4),
          EditorView.lineWrapping,
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          langComp.of(langExtension()),
          themeComp.of(themeExtension()),
          baseTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged && view && view.state.doc.toString() !== opts.value.value)
              opts.value.value = view.state.doc.toString()
          }),
        ],
      }),
      parent: el,
    })
    darkObs = new MutationObserver(() => {
      const d = document.documentElement.classList.contains('dark')
      if (d !== isDark.value) {
        isDark.value = d
        view?.dispatch({ effects: themeComp.reconfigure(themeExtension()) })
      }
    })
    darkObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  }

  function destroy() {
    if (view) {
      view.destroy()
      view = null
    }
    if (darkObs) {
      darkObs.disconnect()
      darkObs = null
    }
  }

  // 宿主在 v-if 内:出现/消失时创建/销毁编辑器(flush:post 等 DOM 落定)
  const stopHost = watch(opts.host, el => (el ? create(el) : destroy()), { flush: 'post' })
  // 外部写入 value(载入 lastCode、切语言重置)→ 整体替换文档(防回环)
  const stopValue = watch(opts.value, (v) => {
    if (view && view.state.doc.toString() !== v)
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } })
  })
  // 切语言 → 重配语言扩展(不重建编辑器)
  const stopLang = watch(opts.lang, () => view?.dispatch({ effects: langComp.reconfigure(langExtension()) }))

  onUnmounted(() => {
    destroy()
    stopHost()
    stopValue()
    stopLang()
  })

  return { requestMeasure: () => view?.requestMeasure() }
}
