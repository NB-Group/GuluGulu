import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { bracketMatching, defaultHighlightStyle, ensureSyntaxTree, indentUnit, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { pascal } from '@codemirror/legacy-modes/mode/pascal'
import { forceLinting, linter, lintGutter } from '@codemirror/lint'
import { search, searchKeymap } from '@codemirror/search'
import type { Extension } from '@codemirror/state'
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import type { DecorationSet } from '@codemirror/view'
import { Decoration, drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view'
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

// 编辑器外观基于 --bew-* 变量(随 .dark 自动切换 bg/fg/gutter)。
// 字号跟随全局 --bew-base-font-size(在设置里调"基础字号"时编辑器同步缩放)。
const baseTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--bew-fill-1)', color: 'var(--bew-text-1)', height: '100%', fontSize: 'var(--bew-base-font-size, 15px)' },
  '.cm-scroller': { fontFamily: 'Cascadia Code,Fira Code,JetBrains Mono,Consolas,monospace', lineHeight: '1.7' },
  '.cm-content': { padding: '8px 0px' },
  '.cm-gutters': { backgroundColor: 'var(--bew-fill-1)', color: 'var(--bew-text-4)', border: 'none', fontSize: 'calc(var(--bew-base-font-size, 15px) - 2px)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-errline': { backgroundColor: 'rgba(228,64,76,0.18)' },
  '.cm-selectionBackground, ::selection': { background: 'var(--bew-theme-color-30)' },
  // 语法检测:让波浪线/tooltip/gutter 醒目可见(@codemirror/lint 默认样式在某些主题下被吞)
  '.cm-diagnostic': { color: 'var(--bew-text-2)', borderLeft: '3px solid var(--bew-error-color)', background: 'var(--bew-error-color-10, rgba(228,64,76,0.06))' },
  '.cm-diagnosticText': { fontSize: 'calc(var(--bew-base-font-size, 15px) - 1px)' },
  '.cm-lintRange': { backgroundPosition: 'left bottom', backgroundSize: '6px 4px' },
  '.cm-lintRange-error': { backgroundImage: 'linear-gradient(45deg, transparent 65%, var(--bew-error-color) 80%, var(--bew-error-color) 90%, transparent 95%), linear-gradient(-45deg, transparent 65%, var(--bew-error-color) 80%, var(--bew-error-color) 90%, transparent 95%)', backgroundRepeat: 'repeat-x' },
  '.cm-lintRange-warning': { backgroundImage: 'linear-gradient(45deg, transparent 65%, var(--bew-warning-color) 80%, var(--bew-warning-color) 90%, transparent 95%), linear-gradient(-45deg, transparent 65%, var(--bew-warning-color) 80%, var(--bew-warning-color) 90%, transparent 95%)', backgroundRepeat: 'repeat-x' },
  '.cm-lint-marker-error, .cm-lint-marker-warning': { fontSize: '12px' },
  '&.cm-tooltip.cm-tooltip-lint, & .cm-tooltip-lint': { background: 'var(--bew-content)', border: '1px solid var(--bew-border-color)', color: 'var(--bew-text-1)' },
})

/**
 * 在给定宿主元素上挂载一个 CodeMirror 6 编辑器,与 `value` 双向绑定,
 * 跟随 `lang`(aceMode)切换语言、跟随系统深浅色切换语法高亮主题。
 *
 * host 通常在 `v-if` 内,故用 `watch(host)`(flush:post)管理生命周期:
 * 出现即 `new EditorView`,消失即 `destroy()`——`onMounted` 抓不到 v-if 延迟出现的宿主。
 */
// 实时语法检查:等 Lezer 语法树完整解析后,遍历并标记错误节点(波浪线)。
// 只对带 Lezer 文法的语言(c_cpp/python/java/javascript)生效;plain_text/pascal 无文法则不报。
// 异步 + ensureSyntaxTree 是关键:同步读 syntaxTree 常拿到未解析完的部分树,漏报错误。
const syntaxLinter = linter(async (view) => {
  const diags: Array<{ from: number, to: number, severity: 'warning', message: string }> = []
  try {
    const tree = await ensureSyntaxTree(view.state, view.state.doc.length, 500)
    if (!tree)
      return diags // 解析超时,本轮跳过(下次 keystroke 再试)
    tree.iterate({
      enter(node) {
        const t = node.type as any
        if (t && t.isError && node.to > node.from)
          diags.push({ from: node.from, to: node.to, severity: 'error', message: '语法错误:此处无法解析' })
      },
    })
  }
  catch { /* never let lint break the editor */ }
  return diags.slice(0, 50)
}, { delay: 400 })

// 报错行高亮:外部把 CE/RE 报错解析出的行号喂进来,编辑器高亮对应行。
const setHighlight = StateEffect.define<number[]>()
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setHighlight)) {
        if (!e.value.length)
          return Decoration.none
        const decos: any[] = []
        for (const ln of e.value) {
          if (ln < 1 || ln > tr.state.doc.lines)
            continue
          decos.push(Decoration.line({ class: 'cm-errline' }).range(tr.state.doc.line(ln).from))
        }
        return Decoration.set(decos, true)
      }
    }
    return deco
  },
  provide: f => EditorView.decorations.from(f),
})

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
          autocompletion(),
          bracketMatching(),
          search({ top: true }),
          indentUnit.of('    '),
          EditorState.tabSize.of(4),
          EditorView.lineWrapping,
          keymap.of([
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          langComp.of(langExtension()),
          themeComp.of(themeExtension()),
          lintGutter(),
          syntaxLinter,
          highlightField,
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
    // 初始载入代码(如 lastCode)时强制跑一次语法检测——linter 默认只在文档变更时触发,
    // 而 EditorState.create 的初始 doc 不算 update,否则打开就有错也不显示波浪线。
    setTimeout(() => {
      if (view)
        forceLinting(view)
    }, 150)
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

  return {
    requestMeasure: () => view?.requestMeasure(),
    highlightLines: (lines: number[]) => view?.dispatch({ effects: setHighlight.of(lines.filter(l => l >= 1)) }),
    clearHighlights: () => view?.dispatch({ effects: setHighlight.of([]) }),
    jumpToLine: (n: number) => {
      if (!view || n < 1)
        return
      const line = view.state.doc.line(n)
      view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'center' }), selection: { anchor: line.from } })
    },
  }
}
