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

// ---- AI inline 补全(Monaco 原生 ghost:有语法高亮、Tab 原生处理)----
// 注意:Monaco 的 inline suggestion 按「位置+model版本」缓存,同一位置无内容变更时不会
// 重新调 provider/不会替换 ghost → 原生 ghost 无法逐字流式刷新(VSCode Copilot 也是生成完
// 再整段显示)。所以这里 provider 等整段结果回来后用原生 ghost 一次性显示;网络仍走流式拉
// (TTFB 低),结果齐了交给 Monaco 渲染(带高亮)。用户继续打字(新位置)→ 取消旧流、重算。
const AI_LANGS = ['cpp', 'c', 'java', 'javascript', 'typescript', 'pascal', 'python', 'go', 'rust', 'php', 'csharp']

// 最新请求序号:用户打字产生新请求时,旧请求结果过期丢弃(返回空,不覆盖更新的 ghost)
let aiSeq = 0

function registerInlineAiProvider(monaco: any) {
  for (const lang of AI_LANGS) {
    try {
      monaco.languages.registerInlineCompletionsProvider(lang, {
        async provideInlineCompletions(model: any, position: any) {
          const my = ++aiSeq
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

          // 取消上一条还在路上的流(省带宽);await 整段结果回来
          const { abortAiStream, streamInlineCompletion } = await import('./aiCompletion')
          abortAiStream()
          const final = await streamInlineCompletion(lang, pre, suf, () => {})
          // 过期(用户已打字,有更新的请求)→ 丢弃,不覆盖更新的 ghost
          if (my !== aiSeq)
            return { items: [] }
          console.warn('[guly-ai] ghost show', JSON.stringify(final).slice(0, 160))
          if (!final)
            return { items: [] }
          // 折叠范围:在光标处纯插入(FIM 文本进前后缀之间)
          return {
            items: [{
              insertText: final,
              range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            }],
          }
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
