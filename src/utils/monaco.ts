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

// ---- AI inline 补全(Monaco 原生 ghost + 流式刷新:surgical hook)----
// Monaco 的 inline suggestion 按「位置+版本+triggerKind」缓存(UpdateRequest.satisfies)。
// 缓存是必要的(光标闪烁/空闲不重复请求、Tab 接受靠它)。要让它流式刷新,只 patch
// satisfies:在我们主动刷新的那一拍让它返回 false(缓存未命中 → 重抓 provider → 拿最新累积
// 文本),其余时刻原样。provider 同位置活跃流就返回当前 partial,配合刷新 → 原生 ghost 逐字
// 更新(带高亮)。patch 失败则降级为「等整段一次显示」。用户打字(新位置)→ 取消旧流、重算。
const AI_LANGS = ['cpp', 'c', 'java', 'javascript', 'typescript', 'pascal', 'python', 'go', 'rust', 'php', 'csharp']

let activeEditor: any = null
export function setActiveEditor(e: any) {
  activeEditor = e
  if (e) {
    // 编辑器就绪后尽快 patch(模型可能要一拍才创建,provider 入口也会再尝试)
    setTimeout(tryPatchSatisfies, 0)
  }
  else {
    stopTicker()
  }
}

// ---- hook:让 satisfies 在「强制刷新」那一拍 miss ----
let satisfiesPatched = false
let streamingHookReady = false
let forceMiss = false        // 只在我们 doRefresh 的一拍为 true

function getModel(): any {
  try {
    const ctrl = activeEditor?.getContribution?.('editor.contrib.inlineCompletionsController')
    return ctrl?.model?.get?.() ?? ctrl?.model
  }
  catch { return null }
}
function tryPatchSatisfies() {
  if (satisfiesPatched)
    return
  try {
    const source = getModel()?._source
    // provider 被调时 source._updateOperation.value 已 set(在 fetch 同步段 line 361),
    // 拿它的 request 实例 → UpdateRequest 原型。退而求其次用已缓存的 inlineCompletions。
    const op = source?._updateOperation?.value
    const req = op?.request ?? source?.inlineCompletions?.get?.()?.request
    if (!req)
      return
    const proto = Object.getPrototypeOf(req)
    if (proto.__gulyPatched)
      return
    const origSatisfies = proto.satisfies
    proto.satisfies = function (other: any) {
      if (forceMiss)
        return false // 我们的刷新拍:强制 miss → 重抓 provider
      return origSatisfies.call(this, other)
    }
    proto.__gulyPatched = satisfiesPatched = streamingHookReady = true
    console.warn('[guly-ai] streaming hook ready')
  }
  catch { /* 内部结构不符 → 静默降级 */ }
}
// 强制刷新原生 ghost:forceMiss 一拍 + noDelay 重算 → source 重抓 → provider 返回当前 shown 文本
function doRefresh() {
  tryPatchSatisfies()
  const model = getModel()
  if (!model)
    return
  forceMiss = true
  try { model.trigger?.(undefined, { noDelay: true }) }
  catch { /* ignore */ }
  // satisfies 检查在 trigger 同步段内完成,随后复位
  setTimeout(() => { forceMiss = false }, 0)
}

// 打字机平滑:服务端 chunk 跨度大(一蹦一蹦),用固定节奏把「已显示长度 shown」逐字推向目标,
// 让 ghost 匀速打出来。chunk 只更新 partial(目标),ticker 负责 reveal。
// ⚠️ tick 间隔必须 > Monaco 的 fetch+render 周期,否则新一拍会把上一拍未渲染完的 fetch
// cancel 掉,只有最后一帧(shown=满)渲染 → 看着「一瞬间全出来」。所以用 ~90ms 而非 30ms。
let tickTimer: ReturnType<typeof setInterval> | null = null
function startTicker() {
  if (tickTimer)
    return
  tickTimer = setInterval(() => {
    const s = stream
    if (!s) { stopTicker(); return }
    const target = s.partial.length
    if (s.shown < target) {
      // 步长:缓冲小→少字(等服务器),缓冲大→多字(追上),封顶 25 避免又太快
      const step = Math.max(2, Math.min(25, Math.ceil((target - s.shown) / 10)))
      s.shown = Math.min(target, s.shown + step)
      doRefresh()
    }
    // 显示到目标 且 流已结束 → 停表;否则继续 tick(等下一个 chunk 或收尾)
    if (s.shown >= target && s.done)
      stopTicker()
  }, 90)
}
function stopTicker() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
}

// 当前活跃流
let stream: { id: number, posKey: string, preLen: number, partial: string, shown: number, done: boolean } | null = null
let nextStreamId = 0
let aiSeq = 0

function registerInlineAiProvider(monaco: any) {
  for (const lang of AI_LANGS) {
    try {
      monaco.languages.registerInlineCompletionsProvider(lang, {
        async provideInlineCompletions(model: any, position: any) {
          // 抓 UpdateRequest 原型并 patch(此时 source._updateOperation.value 已就绪);
          // patch 成功后 streamingHookReady=true,后续走流式分支。
          tryPatchSatisfies()
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

          const posKey = `${position.lineNumber}:${position.column}`
          const mkRange = () => new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)

          // hook 就绪 + 同位置活跃流 → 返回「已 reveal 的文本」(打字机平滑:partial.slice(0, shown))
          if (streamingHookReady && stream && stream.posKey === posKey && stream.preLen === pre.length) {
            const shown = stream.partial.slice(0, stream.shown)
            console.warn('[guly-ai] progressive', stream.shown, '/', stream.partial.length)
            if (!shown)
              return { items: [] }
            return { items: [{ insertText: shown, range: mkRange() }] }
          }

          // 新位置 → 取消旧流、开新流
          const { abortAiStream, streamInlineCompletion } = await import('./aiCompletion')
          abortAiStream()
          const id = ++nextStreamId
          stream = { id, posKey, preLen: pre.length, partial: '', shown: 0, done: false }

          if (streamingHookReady) {
            // 流式:chunk 只更新目标 partial;打字机 ticker 负责匀速 reveal + 刷新原生 ghost
            streamInlineCompletion(lang, pre, suf, (acc) => {
              if (!stream || stream.id !== id)
                return
              stream.partial = acc
              startTicker()
            }).then((final) => {
              if (!stream || stream.id !== id)
                return
              stream.partial = final || stream.partial
              stream.done = true
              console.warn('[guly-ai] ghost final', JSON.stringify(stream.partial).slice(0, 160))
              startTicker() // 收尾:把剩余 reveal 完
            })
            return { items: [] }
          }

          // 降级(hook 没装上):等整段结果一次显示
          const final = await streamInlineCompletion(lang, pre, suf, () => {})
          if (my !== aiSeq)
            return { items: [] }
          if (!final)
            return { items: [] }
          return { items: [{ insertText: final, range: mkRange() }] }
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
