import type { Ref } from 'vue'
import { onUnmounted, ref, watch } from 'vue'
import browser from 'webextension-polyfill'

import { bracketDiagnostics, checkGuluSyntax, ensureMonaco, prettyFormat, setActiveEditor } from '~/utils/monaco'
import { lintCpp } from '~/utils/treeSitterLint'

/**
 * Monaco-based drop-in replacement for `useCodeMirror`.
 *
 * Same surface: pass `host`/`value`/`lang` (aceMode string) refs; get back
 * `{ requestMeasure, highlightLines, clearHighlights, jumpToLine, formatDocument }`.
 * ProblemDetail and CodeEditor only need the import swap.
 *
 * Monaco is loaded lazily (externalized under extension/assets/monaco/, see
 * utils/monaco.ts). The editor mounts into the given host (inside the Shadow
 * DOM). Monaco injects its CSS into document.head by default — we clone those
 * styles into the editor's shadow root so they apply there.
 */

// aceMode → monaco language id. Monaco's basic-languages cover all of these.
const ACE_TO_MONACO: Record<string, string> = {
  c_cpp: 'cpp',
  cpp: 'cpp',
  c: 'c',
  python: 'python',
  java: 'java',
  javascript: 'javascript',
  typescript: 'typescript',
  pascal: 'pascal',
  plain_text: 'plaintext',
  golang: 'go',
  rust: 'rust',
  php: 'php',
  csharp: 'csharp',
  haskell: 'haskell',
  kotlin: 'kotlin',
  ruby: 'ruby',
  scala: 'scala',
  perl: 'perl',
  lua: 'lua',
  ocaml: 'ocaml',
  julia: 'julia',
}
function langOf(aceMode: string): string {
  return ACE_TO_MONACO[aceMode] || 'plaintext'
}

function readBaseFontSize(host: HTMLElement): number {
  try {
    const v = getComputedStyle(host).getPropertyValue('--bew-base-font-size').trim()
    const n = Number.parseFloat(v)
    if (Number.isFinite(n) && n > 0)
      return Math.round(n)
  }
  catch { /* ignore */ }
  return 15
}

const MONO_FONT = `'JetBrains Mono','Fira Code','Cascadia Code','Source Code Pro','DejaVu Sans Mono',Consolas,ui-monospace,monospace`
const CUSTOM_CSS = `
.gulu-errline { background: rgba(228,64,76,0.18) !important; }
.monaco-editor .overflow-guard { border-radius: inherit; }

/* 把 Monaco 的 --vscode-* 主题变量映射到项目 --bew-*,让编辑器配色跟项目一致。
   !important 是为了盖过 Monaco 自带 vs/vs-dark 主题样式表(同优先级,我们后注入)。 */
.monaco-editor {
  --vscode-editor-background: var(--bew-content) !important;
  --vscode-editor-foreground: var(--bew-text-1) !important;
  --vscode-editorGutter-background: var(--bew-content) !important;
  --vscode-editorLineNumber-foreground: var(--bew-text-4) !important;
  --vscode-editorLineNumber-activeForeground: var(--bew-text-2) !important;
  --vscode-editorCursor-foreground: var(--bew-theme-color) !important;
  --vscode-editor-selectionBackground: var(--bew-theme-color-30) !important;
  --vscode-editor-inactiveSelectionBackground: var(--bew-fill-3) !important;
  --vscode-editor-lineHighlightBackground: transparent !important;
  --vscode-editor-lineHighlightBorder: transparent !important;
  --vscode-editorIndentGuide-background: var(--bew-border-color) !important;
  --vscode-editorIndentGuide-activeBackground: var(--bew-text-4) !important;
  --vscode-editorWhitespace-foreground: var(--bew-text-4) !important;
  --vscode-editorBracketMatch-background: var(--bew-theme-color-20) !important;
  --vscode-editorBracketMatch-border: var(--bew-theme-color) !important;
  --vscode-editorGhostText-foreground: var(--bew-text-4) !important;
  --vscode-editorGhostText-border: transparent !important;
  --vscode-editorSuggestWidget-background: var(--bew-elevated) !important;
  --vscode-editorSuggestWidget-border: var(--bew-border-color) !important;
  --vscode-editorSuggestWidget-foreground: var(--bew-text-1) !important;
  --vscode-editorSuggestWidget-selectedBackground: var(--bew-theme-color-30) !important;
  --vscode-list-hoverBackground: var(--bew-fill-2) !important;
}
/* 主题切换时 Monaco 的 background-color 直接读上面的变量,但部分子层(.monaco-editor-
   background / .margin)在主题表里被显式赋值,这里兜底强制跟随。 */
.monaco-editor, .monaco-editor-background, .monaco-editor .margin,
.monaco-editor .scroll-decoration {
  background-color: var(--bew-content) !important;
}

/* Force monospace on every layer Monaco renders text in (token spans inherit
   the editor's font-family, but some themes reset it — !important guarantees
   a monospace glyph cell). */
.monaco-editor, .monaco-editor .inputarea, .monaco-editor .view-line,
.monaco-editor .view-lines, .monaco-editor .mtk1, .monaco-editor .mtk2,
.monaco-editor .mtk3, .monaco-editor .mtk4, .monaco-editor .mtk5,
.monaco-editor .mtkcorrection, .monaco-editor .codicon {
  font-family: ${MONO_FONT} !important;
}
`

export function useMonaco(opts: {
  host: Ref<HTMLElement | undefined>
  value: Ref<string>
  lang: Ref<string>
}) {
  let monacoNS: any = null
  let editor: any = null
  let model: any = null
  let decorations: any = null
  let darkObs: MutationObserver | null = null
  let resizeObs: ResizeObserver | null = null
  let fontTimer: ReturnType<typeof setInterval> | null = null
  let lastFont = 15
  const isDark = ref(document.documentElement.classList.contains('dark'))

  // Inject JetBrains Mono @font-face into the main document head (applies to
  // the shadow DOM too). Idempotent. Call BEFORE creating the editor so the
  // font is available for Monaco's metric measurement.
  function injectFontFace() {
    if (document.getElementById('gulu-monaco-fontface'))
      return
    const fm = (w: number) => browser.runtime.getURL(`/assets/fonts/jetbrains-mono/jetbrains-mono-${w}.woff2`)
    const css = `
@font-face { font-family: 'JetBrains Mono'; font-weight: 400; font-style: normal; font-display: swap; src: url(${fm(400)}) format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-weight: 500; font-style: normal; font-display: swap; src: url(${fm(500)}) format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-weight: 700; font-style: normal; font-display: swap; src: url(${fm(700)}) format('woff2'); }
`
    const el = document.createElement('style')
    el.id = 'gulu-monaco-fontface'
    el.textContent = css
    document.head.appendChild(el)
  }

  function injectCustomCss(root: ShadowRoot) {
    if ((root as any).__guluMonacoCss)
      return
    const el = document.createElement('style')
    el.textContent = CUSTOM_CSS
    root.appendChild(el)
    ;(root as any).__guluMonacoCss = true
  }

  // Monaco's CSS was stripped from the ESM tree at build time (browser won't
  // load CSS as a JS module). It's flattened into one stylesheet exported by
  // _gulu_styles.js; load it, swap the font URL placeholder for the real
  // chrome-extension base, and inject into the shadow root where Monaco lives.
  async function injectMonacoStyles(root: ShadowRoot) {
    if ((root as any).__guluMonacoStyles)
      return
    try {
      const base = browser.runtime.getURL('/assets/monaco/esm')
      const mod = await import(/* @vite-ignore */ `${base}/_gulu_styles.js`) as any
      const css = String(mod.default || '').replace(/__GULY_MONACO_BASE__/g, base)
      const el = document.createElement('style')
      el.textContent = css
      root.appendChild(el)
      ;(root as any).__guluMonacoStyles = true
    }
    catch (e) { console.warn('[GuluGulu] monaco styles inject failed:', e) }
  }

  // Real syntax diagnostics: C/C++ via tree-sitter (async, debounced); other
  // languages fall back to the lightweight bracket checker in utils/monaco.ts.
  let lintTimer: ReturnType<typeof setTimeout> | null = null
  function runLint(immediate = false) {
    if (lintTimer)
      clearTimeout(lintTimer)
    const fire = async () => {
      if (!model || !monacoNS)
        return
      const monacoLang = langOf(opts.lang.value)
      if (monacoLang === 'cpp' || monacoLang === 'c') {
        // tree-sitter (parse errors: missing semicolons, malformed statements)
        // + bracket checker (unbalanced braces) — union both, set once.
        const code = model.getValue()
        const [tsMarkers] = await Promise.all([lintCpp(code, monacoLang)])
        if (!model)
          return
        const Err = monacoNS.MarkerSeverity.Error
        const merged = [
          ...tsMarkers.map(m => ({ ...m, severity: Err })),
          ...bracketDiagnostics(code).map(m => ({ ...m, severity: Err })),
        ]
        monacoNS.editor.setModelMarkers(model, 'gulu-syntax', merged)
      }
      else {
        checkGuluSyntax(monacoNS, model)
      }
    }
    lintTimer = setTimeout(fire, immediate ? 0 : 350)
  }

  async function create(el: HTMLElement) {
    monacoNS = await ensureMonaco()
    if (!monacoNS)
      return
    if (editor)
      dispose()

    // Inject JetBrains Mono @font-face into the main document FIRST and wait
    // for it to load BEFORE creating the editor — Monaco measures character
    // widths with the font active at creation time and caches the metrics, so
    // creating with a fallback then loading the font leaves the cursor / indent
    // guides misaligned. document.head @font-face applies to the shadow DOM too.
    injectFontFace()
    try { await (document as any).fonts?.load?.(`16px "JetBrains Mono"`) }
    catch { /* ignore — editor still works with fallback */ }

    lastFont = readBaseFontSize(el)
    model = monacoNS.editor.createModel(opts.value.value || '', langOf(opts.lang.value))
    editor = monacoNS.editor.create(el, {
      model,
      theme: isDark.value ? 'vs-dark' : 'vs',
      fontFamily: MONO_FONT,
      fontLigatures: true,
      fontSize: lastFont,
      lineHeight: Math.round(lastFont * 1.7),
      tabSize: 4,
      insertSpaces: true,
      automaticIndent: true,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      minimap: { enabled: false },
      inlineSuggest: { enabled: true }, // AI ghost-text 补全
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      cursorBlinking: 'smooth',
      padding: { top: 8 },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      fixedOverflowWidgets: true,
    })
    decorations = editor.createDecorationsCollection([])
    // AI 流式 ghost 需要 editor 引用来触发 inlineSuggest 重显
    setActiveEditor(editor)

    const root = el.getRootNode()
    if (root instanceof ShadowRoot) {
      // Monaco CSS is flattened (CSS-as-module imports stripped at build time);
      // inject it here into the shadow root where the editor lives.
      injectMonacoStyles(root)
      injectCustomCss(root)
    }

    // Block app-level shortcuts (e.g. TopBar '/' → search) while typing in the
    // editor. Capture-phase stopPropagation on the editor DOM prevents the
    // keydown from reaching window listeners — more reliable than a
    // composedPath() check (Monaco 0.56 may use the EditContext API).
    editor.getDomNode()?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === '/' || e.key === '\'')
        e.stopPropagation()
    }, true)

    // Relayout on container resize (DevTools dock, window resize, split-view
    // drag). Monaco doesn't observe its host; without this the editor keeps the
    // old width and leaves empty space on the right.
    resizeObs = new ResizeObserver(() => editor?.layout())
    resizeObs.observe(el)

    // model → value (anti-echo) + 实时语法检测。
    // 注:inline ghost-text 补全不再手动 trigger —— inlineCompletions contrib 加载后,
    // Monaco 打字时会原生自动调用 provider(见 type→provideInlineCompletions 调用栈)。
    // 之前的手动 trigger 会和原生触发双重调用、互相清空 ghost,已移除。
    model.onDidChangeContent(() => {
      const v = model.getValue()
      if (v !== opts.value.value)
        opts.value.value = v
      runLint()
    })
    runLint(true)

    // dark mode flip
    darkObs = new MutationObserver(() => {
      const d = document.documentElement.classList.contains('dark')
      if (d !== isDark.value) {
        isDark.value = d
        editor?.updateOptions({ theme: d ? 'vs-dark' : 'vs' })
      }
    })
    darkObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    // font size follows global --bew-base-font-size (cheap poll)
    fontTimer = setInterval(() => {
      if (!editor)
        return
      const f = readBaseFontSize(el)
      if (f !== lastFont) {
        lastFont = f
        editor.updateOptions({ fontSize: f, lineHeight: Math.round(f * 1.7) })
      }
    }, 1500)

    requestAnimationFrame(() => editor?.layout())
  }

  function dispose() {
    if (fontTimer) { clearInterval(fontTimer); fontTimer = null }
    if (lintTimer) { clearTimeout(lintTimer); lintTimer = null }
    if (resizeObs) { resizeObs.disconnect(); resizeObs = null }
    if (darkObs) { darkObs.disconnect(); darkObs = null }
    if (decorations) { decorations.clear(); decorations = null }
    setActiveEditor(null)
    if (editor) { editor.dispose(); editor = null }
    if (model) { model.dispose(); model = null }
  }

  // host lives in v-if: create when present, dispose when gone (flush:post)
  const stopHost = watch(opts.host, el => (el ? create(el) : dispose()), { flush: 'post' })
  // external value write (load lastCode / reset) → replace model content
  const stopValue = watch(opts.value, (v) => {
    if (model && model.getValue() !== v)
      model.setValue(v ?? '')
  })
  // language swap → re-tag the model (no editor rebuild) + re-lint
  const stopLang = watch(opts.lang, (l) => {
    if (monacoNS && model)
      monacoNS.languages.setModelLanguage(model, langOf(l))
    runLint(true)
  })

  onUnmounted(() => {
    dispose()
    stopHost()
    stopValue()
    stopLang()
  })

  return {
    requestMeasure: () => editor?.layout(),
    highlightLines: (lines: number[]) => {
      if (!editor || !decorations || !monacoNS)
        return
      const items = lines.filter(l => l >= 1).map(ln => ({
        range: new monacoNS.Range(ln, 1, ln, 1),
        options: { isWholeLine: true, className: 'gulu-errline' },
      }))
      decorations.set(items)
    },
    clearHighlights: () => decorations?.clear(),
    jumpToLine: (n: number) => {
      if (!editor || n < 1)
        return
      editor.revealLineInCenter(n)
      editor.setPosition({ lineNumber: n, column: 1 })
    },
    formatDocument: () => {
      // Indentation + conservative spacing normalization, applied directly via
      // executeEdits (Monaco's format action / provider system is unreliable
      // here). executeEdits keeps undo history.
      if (!editor || !model)
        return
      const next = prettyFormat(model.getValue())
      if (next !== model.getValue())
        editor.executeEdits('gulu-format', [{ range: model.getFullModelRange(), text: next }])
    },
  }
}
