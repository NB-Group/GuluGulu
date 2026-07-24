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

// ---- AI inline 补全(ghost-text,流式逐字更新)----
// 思路:Monaco 的 inline provider 是一次性的,不原生支持流式。我们用「累积文本 + 重触发」
// 模拟:首次调用启动一条流式请求(走 background port),返回空;每到一个 chunk 更新当前
// 累积文本,并 throttle 触发 editor.action.inlineSuggest.trigger,Monaco 重查 provider,
// 此时同位置活跃流 → 直接返回累积文本,ghost 逐字刷新。用户打字(位置/前缀变)→ 取消旧流、
// 开新流。
const AI_LANGS = ['cpp', 'c', 'java', 'javascript', 'typescript', 'pascal', 'python', 'go', 'rust', 'php', 'csharp']

let activeEditor: any = null
export function setActiveEditor(e: any) {
  activeEditor = e
}

// 当前活跃流
let stream: { id: number, posKey: string, preLen: number, partial: string, done: boolean } | null = null
let nextStreamId = 0
let triggerQueued = false

function scheduleGhostRefresh() {
  if (triggerQueued)
    return
  triggerQueued = true
  setTimeout(() => {
    triggerQueued = false
    try { activeEditor?.getAction('editor.action.inlineSuggest.trigger')?.run() }
    catch { /* ignore */ }
  }, 45)
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
          // 同位置活跃流(含已完成)→ 直接返回累积文本(progress / 缓存的最终结果)
          if (stream && stream.posKey === posKey && stream.preLen === pre.length && stream.partial) {
            return {
              items: [{
                insertText: stream.partial,
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
              }],
            }
          }

          // 启动新流:取消旧的
          const { abortAiStream, streamInlineCompletion } = await import('./aiCompletion')
          abortAiStream()
          const id = ++nextStreamId
          stream = { id, posKey, preLen: pre.length, partial: '', done: false }

          streamInlineCompletion(lang, pre, suf, (acc) => {
            // 过期(用户已打字,流被取代)→ 忽略
            if (!stream || stream.id !== id)
              return
            stream.partial = acc
            scheduleGhostRefresh()
          }).then((final) => {
            if (!stream || stream.id !== id)
              return
            stream.partial = final || stream.partial
            stream.done = true
            console.warn('[guly-ai] ghost final', JSON.stringify(stream.partial).slice(0, 160))
            scheduleGhostRefresh()
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
