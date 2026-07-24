/* eslint-disable style/max-statements-per-line */
import browser from 'webextension-polyfill'

/**
 * Monaco editor loader (externalized, like katex).
 *
 * The content-script IIFE bundle must NOT include Monaco (~5MB). Instead we
 * ship Monaco's ESM tree + a classic editor.worker under
 * `extension/assets/monaco/` (copied by scripts/prepare.ts) and load it at
 * runtime via a real dynamic import of a `chrome-extension://` URL — the same
 * proven pattern as `ensureKatex()` in markdown.ts.
 *
 * MV3 CSP is `script-src 'self'`: same-origin `new Worker(chrome.runtime.
 * getURL(...))` is allowed (blob: workers are not). `MonacoEnvironment.getWorker`
 * must be set on `self` BEFORE the editor.main module evaluates, because
 * Monaco reads it at module-eval time.
 */

type MonacoNS = typeof import('monaco-editor')

let monacoInstance: MonacoNS | null = null
let loadingPromise: Promise<MonacoNS | null> | null = null

// Monaco 内部频繁 cancel 上一条 inline 请求,在它自己的 observable/autorun 链上 reject
// 一个 name==='Canceled' 的错误,够不到、没法从调用侧 catch,会刷 "Uncaught (in promise)
// Canceled"。装个全局 unhandledrejection 守卫吞掉它(Canceled 永远是良性的)。
let canceledGuardInstalled = false
function installCanceledGuard() {
  if (canceledGuardInstalled)
    return
  canceledGuardInstalled = true
  try {
    (self as any).addEventListener?.('unhandledrejection', (e: any) => {
      const r = e?.reason
      if (r && (r?.name === 'Canceled' || r === 'Canceled' || r?.message === 'Canceled'))
        e.preventDefault()
    })
  }
  catch { /* ignore */ }
}

function editorWorkerUrl(): string {
  // ESM worker (module worker). Monaco 0.56's classic min worker is AMD-only
  // and unusable under MV3 CSP; the ESM worker loads as `{ type: 'module' }`
  // and its internal imports resolve against the chrome-extension URL.
  return browser.runtime.getURL('/assets/monaco/esm/vs/editor/editor.worker.js')
}

export async function ensureMonaco(): Promise<MonacoNS | null> {
  if (monacoInstance)
    return monacoInstance
  if (loadingPromise)
    return loadingPromise

  loadingPromise = (async () => {
    try {
      installCanceledGuard()
      // Set up the worker factory first. Returning the editor.worker for every
      // label is fine for our languages (cpp/python/java use the generic
      // editor.worker); JS/TS would want a ts.worker but degrade gracefully.
      ;(self as any).MonacoEnvironment = {
        getWorker: () => new Worker(editorWorkerUrl(), { type: 'module' }),
      }

      const base = browser.runtime.getURL('/assets/monaco/esm/vs')
      // editor.api.js = core editor + languages namespace, NO external/ LSP
      // client (unlike editor.main.js, which drags in ~32MB of language
      // services). We register only the languages we actually use, lazily.
      const mod = await import(/* @vite-ignore */ `${base}/editor/editor.api.js`) as any
      // Side-effect register the languages we support (Monarch tokenizers,
      // fetched on demand). Order after api so registerLanguage() is ready.
      await Promise.all([
        import(/* @vite-ignore */ `${base}/languages/definitions/cpp/register.js`),
        import(/* @vite-ignore */ `${base}/languages/definitions/python/register.js`),
        import(/* @vite-ignore */ `${base}/languages/definitions/java/register.js`),
        import(/* @vite-ignore */ `${base}/languages/definitions/javascript/register.js`),
        import(/* @vite-ignore */ `${base}/languages/definitions/pascal/register.js`),
      ]).catch(e => console.warn('[GuluGulu] monaco language register failed:', e))
      // editor.api.js 不含 contrib!inline 补全(ghost-text)是 Monaco 的一个 contrib
      // 模块,不显式加载就没有 editor.action.inlineSuggest.trigger action、provider 也不会
      // 被调用。这里 side-effect import 注册 inlineCompletions 贡献点。
      try {
        await import(/* @vite-ignore */ `${base}/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js`)
      }
      catch (e) { console.warn('[GuluGulu] monaco inlineCompletions contrib load failed:', e) }
      const monaco = {
        editor: mod.editor,
        languages: mod.languages,
        Uri: mod.Uri,
        Range: mod.Range,
        MarkerSeverity: mod.MarkerSeverity,
        KeyMod: mod.KeyMod,
        KeyCode: mod.KeyCode,
      } as unknown as MonacoNS
      monacoInstance = monaco
      registerGuluProviders(monaco)
      return monaco
    }
    catch (e) {
      console.warn('[GuluGulu] Monaco load failed:', e)
      loadingPromise = null
      return null
    }
  })()
  return loadingPromise
}

// ---- 语法检测:括号配对(跳过字符串/注释/字符字面量)----
// Monaco 的 C++ 没有内置语法诊断(需 language server),我们自己做一个轻量但
// 可靠的括号检查:能抓到"大括号不闭合/不匹配"这类用户最关心的错误。
// 返回纯 marker 数组(不含 severity),供 useMonaco 与 tree-sitter 结果合并后
// 一次性 setModelMarkers。
export function bracketDiagnostics(text: string) {
  const diags: Array<{ startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, message: string }> = []
  const stack: Array<{ ch: string, line: number, col: number }> = []
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  const open = '([{'
  let i = 0
  let line = 1
  let col = 1
  const n = text.length
  while (i < n) {
    const c = text[i]
    const nxt = text[i + 1]
    if (c === '\n') { line++; col = 1; i++; continue }
    if (c === '/' && nxt === '/') { while (i < n && text[i] !== '\n') i++; continue }
    if (c === '/' && nxt === '*') {
      i += 2; col += 2; while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') { line++; col = 1 }
        else {
          col++
        } i++
      } i += 2; col += 2; continue
    }
    if (c === '"' || c === '\'') {
      const q = c; i++; col++; while (i < n && text[i] !== q) {
        if (text[i] === '\\') { i += 2; col += 2; continue } if (text[i] === '\n') { line++; col = 1 }
        else {
          col++
        } i++
      } i++; col++; continue
    }
    if (open.includes(c)) { stack.push({ ch: c, line, col }); i++; col++; continue }
    if (c in pairs) {
      if (!stack.length || stack[stack.length - 1].ch !== pairs[c])
        diags.push({ startLineNumber: line, startColumn: col, endLineNumber: line, endColumn: col + 1, message: `括号 "${c}" 不匹配` })
      else stack.pop()
      i++; col++; continue
    }
    i++; col++
  }
  while (stack.length) {
    const s = stack.pop()!
    diags.push({ startLineNumber: s.line, startColumn: s.col, endLineNumber: s.line, endColumn: s.col + 1, message: `未闭合的 "${s.ch}"` })
  }
  return diags.slice(0, 100)
}

// Legacy wrapper: set bracket markers directly on the model (used for non-C/C++ langs).
export function checkGuluSyntax(monaco: any, model: any) {
  if (!monaco || !model)
    return
  const diags = bracketDiagnostics(model.getValue())
  monaco.editor.setModelMarkers(model, 'gulu-syntax', diags.map(d => ({ ...d, severity: monaco.MarkerSeverity.Error })))
}

// ---- 自动格式化:基于括号深度的缩进格式化(C++/Java/JS 等大括号语言)----
// 非 clang-format 级,但能修齐缩进(用户最常用的"格式化代码"诉求)。
export function indentFormat(text: string, indent = '    '): string {
  const lines = text.split('\n')
  let depth = 0
  const out: string[] = []
  for (const raw of lines) {
    const trimmed = raw.trim()
    let lineDepth = depth
    if (/^[}\])]/.test(trimmed))
      lineDepth = Math.max(0, depth - 1)
    out.push(trimmed === '' ? '' : indent.repeat(lineDepth) + trimmed)
    // net brace delta ignoring strings/comments on this line
    const cleaned = trimmed.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*|\/\*[\s\S]*?\*\//g, '')
    let net = 0
    for (const ch of cleaned) {
      if (ch === '{' || ch === '[' || ch === '(')
        net++
      else if (ch === '}' || ch === ']' || ch === ')')
        net--
    }
    depth = Math.max(0, depth + net)
  }
  return out.join('\n')
}

// 把一行拆成 code / string / char / comment 片段(空格归一化只作用于 code 片段)
function splitSegments(line: string) {
  const segs: Array<{ code: boolean, s: string }> = []
  let i = 0
  let buf = ''
  const flush = () => { if (buf) { segs.push({ code: true, s: buf }); buf = '' } }
  while (i < line.length) {
    const c = line[i]
    const n = line[i + 1]
    if (c === '/' && n === '/') { flush(); segs.push({ code: false, s: line.slice(i) }); break }
    if (c === '/' && n === '*') {
      flush()
      let j = line.indexOf('*/', i + 2); j = j < 0 ? line.length : j + 2
      segs.push({ code: false, s: line.slice(i, j) }); i = j; continue
    }
    if (c === '"' || c === '\'') {
      flush()
      const q = c; let j = i + 1
      while (j < line.length && line[j] !== q) {
        if (line[j] === '\\')
          j++; j++
      }
      j++
      segs.push({ code: false, s: line.slice(i, j) }); i = j; continue
    }
    buf += c; i++
  }
  flush()
  return segs
}

// 保守的空格归一化(只做不易破坏代码的变换):
//  - 逗号/分号后加空格
//  - 赋值/比较/逻辑/位移/复合赋值运算符两边加空格(用 lookbehind/lookahead 排除
//    `==`/`<=`/`>=`/`!=`/`+=` 等的内部、以及 `<` `>` 模板尖括号——模板不处理)
//  - 关键字 (if/for/while/switch/catch/sizeof) 与 `(` 之间加空格
function spaceCode(code: string): string {
  return code
    .replace(/,(?=\S)/g, ', ')
    .replace(/;(?=\S)/g, '; ')
    .replace(/\b(if|for|while|switch|catch|sizeof)\s*\(/g, '$1 (')
    // 复合/比较/逻辑/位移运算符先处理(两字符)
    .replace(/([^<>=!+\-*/%&|^])(\+=|-=|\*=|\/=|%=|<<=|>>=|==|!=|<=|>=|&&|\|\||<<|>>)([^=])/g, '$1 $2 $3')
    // 单字符赋值 `=`(排除 ==/<=/>=/!=/+= 等已处理或前后是运算符字符的)
    .replace(/([^=!<>+\-*/%&|^])=(?!=)/g, '$1 = ')
    .replace(/\s{2,}/g, ' ')
}

// 缩进 + 空格归一化(跳过预处理行 #include/#define 等)
export function prettyFormat(text: string): string {
  return indentFormat(text).split('\n').map((line) => {
    const m = line.match(/^\s*/)
    const indent = m[0]
    const body = line.slice(indent.length)
    if (!body || body.startsWith('#'))
      return line
    const formatted = splitSegments(body).map(seg => (seg.code ? spaceCode(seg.s) : seg.s)).join('')
    return (indent + formatted).replace(/[ \t]+$/, '')
  }).join('\n')
}

const FORMAT_LANGS = ['cpp', 'c', 'java', 'javascript', 'typescript', 'pascal', 'go', 'rust', 'php', 'csharp']
let providersRegistered = false
export function registerGuluProviders(monaco: any) {
  if (providersRegistered || !monaco?.languages)
    return
  providersRegistered = true
  for (const lang of FORMAT_LANGS) {
    try {
      monaco.languages.registerDocumentFormattingEditProvider(lang, {
        provideDocumentFormattingEdits: (model: any) => {
          return [{ range: model.getFullModelRange(), text: indentFormat(model.getValue()) }]
        },
      })
    }
    catch { /* language not registered — ignore */ }
  }
  registerInlineAiProvider(monaco)
}

// ---- AI inline 补全(自定义 ghost 覆盖层,流式逐字更新)----
// 为什么不用 Monaco 自带的 inline suggestion 显示:它按「位置+model版本」缓存,同一位置
// 没有内容变更时反复 trigger 不会重新调 provider、不会替换已显示的 ghost → 流式只能停在
// 第一段。所以我们让 provider 只返回 {items:[]}(Monaco 不显示任何东西),自己画一个覆盖层
// 随 chunk 实时刷新;Tab 由我们自己接、executeEdits 插入。
const AI_LANGS = ['cpp', 'c', 'java', 'javascript', 'typescript', 'pascal', 'python', 'go', 'rust', 'php', 'csharp']

let activeEditor: any = null
let activeMonaco: any = null

// 当前活跃流(用于判断 provider 是否该重启流)
let stream: { id: number, posKey: string, preLen: number } | null = null
let nextStreamId = 0

// ---- ghost 覆盖层 ----
let ghostEl: HTMLElement | null = null
let ghost: { line: number, col: number, text: string } | null = null
let listenersAttached = false

function ensureGhostEl() {
  if (ghostEl)
    return
  const dom = activeEditor?.getDomNode?.() as HTMLElement | undefined
  if (!dom)
    return
  const el = document.createElement('div')
  el.className = 'gulu-ai-ghost'
  el.style.cssText = 'position:absolute;top:0;left:0;white-space:pre-wrap;pointer-events:none;z-index:5;display:none;opacity:.55;'
  // 字体跟随编辑器
  try {
    const o = activeEditor.getRawOptions?.() || {}
    el.style.fontFamily = o.fontFamily || 'monospace'
    el.style.fontSize = `${o.fontSize || 15}px`
    el.style.lineHeight = `${o.lineHeight || Math.round((o.fontSize || 15) * 1.7)}px`
  }
  catch { /* ignore */ }
  el.style.color = 'var(--bew-text-2)'
  dom.appendChild(el)
  ghostEl = el
}
function renderGhost() {
  if (!ghostEl || !activeEditor)
    return
  if (!ghost || !ghost.text) {
    ghostEl.style.display = 'none'
    return
  }
  const vp = activeEditor.getScrolledVisiblePosition?.({ lineNumber: ghost.line, column: ghost.col })
  if (!vp) {
    // 光标滚出视口,先藏
    ghostEl.style.display = 'none'
    return
  }
  ghostEl.style.display = 'block'
  ghostEl.style.transform = `translate(${vp.left}px, ${vp.top}px)`
  // 限制宽度避免横飞出编辑器
  const width = activeEditor.getLayoutInfo?.().contentLeft + activeEditor.getLayoutInfo?.().contentWidth - vp.left
  if (Number.isFinite(width) && width > 0)
    ghostEl.style.maxWidth = `${width}px`
  ghostEl.textContent = ghost.text
}
export function showAiGhost(line: number, col: number, text: string) {
  ensureGhostEl()
  ghost = { line, col, text }
  renderGhost()
}
export function hideAiGhost() {
  ghost = null
  if (ghostEl)
    ghostEl.style.display = 'none'
}
function acceptGhost() {
  if (!ghost || !activeEditor || !activeMonaco)
    return
  const { line, col, text } = ghost
  hideAiGhost()
  try {
    activeEditor.executeEdits('gulu-ai', [{
      range: new activeMonaco.Range(line, col, line, col),
      text,
      forceMoveMarkers: true,
    }])
  }
  catch (e) { console.warn('[guly-ai] accept failed', e) }
}
function onGhostKey(e: KeyboardEvent) {
  if (!ghost || !ghost.text)
    return
  if (e.key === 'Tab') {
    e.preventDefault()
    e.stopPropagation()
    acceptGhost()
  }
  else if (e.key === 'Escape') {
    e.preventDefault()
    hideAiGhost()
  }
}

export function setActiveEditor(e: any, monaco?: any) {
  activeEditor = e
  if (monaco)
    activeMonaco = monaco
  // 编辑器销毁(e=null)→ 重置,下次创建新编辑器时重新挂监听 + 建 ghost 层
  if (!e) {
    listenersAttached = false
    ghostEl = null
    ghost = null
    return
  }
  if (!listenersAttached) {
    listenersAttached = true
    // 光标离开 ghost 起点 → 藏;滚动 → 重定位
    e.onDidChangeCursorPosition?.(() => {
      if (ghost && (ghost.line !== e.getPosition?.()?.lineNumber || ghost.col !== e.getPosition?.()?.column))
        hideAiGhost()
    })
    e.onDidScrollChange?.(() => { if (ghost) renderGhost() })
    e.onDidChangeModelContent?.(() => {
      // 内容变(用户打字)→ 藏旧 ghost,新的流会重画
      hideAiGhost()
    })
    e.getDomNode?.().addEventListener('keydown', onGhostKey, true)
  }
}

function registerInlineAiProvider(monaco: any) {
  for (const lang of AI_LANGS) {
    try {
      monaco.languages.registerInlineCompletionsProvider(lang, {
        async provideInlineCompletions(model: any, position: any) {
          const prefix = model.getValueInRange({
            startLineNumber: 1, startColumn: 1,
            endLineNumber: position.lineNumber, endColumn: position.column,
          })
          const suffix = model.getValueInRange({
            startLineNumber: position.lineNumber, startColumn: position.column,
            endLineNumber: model.getLineCount(), endColumn: model.getLineMaxColumn(model.getLineCount()),
          })
          const pre = prefix.length > 1500 ? prefix.slice(-1500) : prefix
          const suf = suffix.length > 1500 ? suffix.slice(0, 1500) : suffix
          if (pre.trim().length < 3)
            return { items: [] }

          const posKey = `${position.lineNumber}:${position.column}`
          // 同位置已有活跃流 → 不重启(Monaco 打字时反复调用 provider,避免掐断正在路上的流)
          if (stream && stream.posKey === posKey && stream.preLen === pre.length)
            return { items: [] }

          // 新位置 → 取消旧流、藏旧 ghost、开新流
          const { abortAiStream, streamInlineCompletion } = await import('./aiCompletion')
          abortAiStream()
          hideAiGhost()
          const id = ++nextStreamId
          const line = position.lineNumber
          const col = position.column
          stream = { id, posKey, preLen: pre.length }

          streamInlineCompletion(lang, pre, suf, (acc) => {
            if (!stream || stream.id !== id)
              return
            if (acc)
              showAiGhost(line, col, acc)
          }).then((final) => {
            if (!stream || stream.id !== id)
              return
            console.warn('[guly-ai] ghost final', JSON.stringify(final).slice(0, 160))
            if (final)
              showAiGhost(line, col, final)
          })

          return { items: [] }
        },
        // Monaco dispose 时会调这些,provider 必须提供,给 no-op
        freeInlineCompletions() {},
        disposeInlineCompletions() {},
        handleItemDidShow() {},
        handleItemDidHide() {},
      })
    }
    catch { /* language not registered */ }
  }
}
