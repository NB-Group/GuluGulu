// Luogu API utilities — data extraction, CSRF token, submission

// Shared search keyword across components
export const searchKeyword = ref('')

export interface LuoguLanguage {
  id: number
  name: string
  aceMode: string
  canO2: boolean
  type: string
}

// Language list from Luogu config (/_lfe/config)
export const LUOGU_LANGUAGES: LuoguLanguage[] = [
  { id: 5, name: '提交答案', aceMode: 'plain_text', canO2: false, type: 'AnswerFile' },
  { id: 1, name: 'Pascal', aceMode: 'pascal', canO2: true, type: 'Pascal' },
  { id: 2, name: 'C', aceMode: 'c_cpp', canO2: true, type: 'C' },
  { id: 28, name: 'C++14 (GCC 9)', aceMode: 'c_cpp', canO2: true, type: 'Cpp14Gcc9' },
  { id: 3, name: 'C++98', aceMode: 'c_cpp', canO2: true, type: 'CPP98' },
  { id: 4, name: 'C++11', aceMode: 'c_cpp', canO2: true, type: 'CPP11' },
  { id: 11, name: 'C++14', aceMode: 'c_cpp', canO2: true, type: 'CPP14' },
  { id: 12, name: 'C++17', aceMode: 'c_cpp', canO2: true, type: 'CPP17' },
  { id: 27, name: 'C++20', aceMode: 'c_cpp', canO2: true, type: 'CPP20' },
  { id: 34, name: 'C++23', aceMode: 'c_cpp', canO2: true, type: 'CPP23' },
  { id: 24, name: 'PyPy 2', aceMode: 'python', canO2: false, type: 'PyPy2' },
  { id: 7, name: 'Python 3', aceMode: 'python', canO2: false, type: 'Python3' },
  { id: 25, name: 'PyPy 3', aceMode: 'python', canO2: false, type: 'PyPy3' },
  { id: 8, name: 'Java 8', aceMode: 'java', canO2: false, type: 'Java8' },
  { id: 21, name: 'Java 21', aceMode: 'java', canO2: false, type: 'Java21' },
  { id: 9, name: 'Node.js', aceMode: 'javascript', canO2: false, type: 'NodeJS' },
  { id: 14, name: 'Go', aceMode: 'golang', canO2: false, type: 'Go' },
  { id: 15, name: 'Rust', aceMode: 'rust', canO2: true, type: 'Rust' },
  { id: 16, name: 'PHP', aceMode: 'php', canO2: false, type: 'PHP' },
  { id: 17, name: 'C# Mono', aceMode: 'csharp', canO2: false, type: 'CSharp' },
  { id: 19, name: 'Haskell', aceMode: 'haskell', canO2: false, type: 'Haskell' },
  { id: 20, name: 'Kotlin/JVM', aceMode: 'kotlin', canO2: false, type: 'Kotlin' },
  { id: 18, name: 'Ruby', aceMode: 'ruby', canO2: false, type: 'Ruby' },
  { id: 22, name: 'Scala', aceMode: 'scala', canO2: false, type: 'Scala' },
  { id: 26, name: 'Perl', aceMode: 'perl', canO2: false, type: 'Perl' },
  { id: 10, name: 'Lua', aceMode: 'lua', canO2: false, type: 'Lua' },
  { id: 13, name: 'OCaml', aceMode: 'ocaml', canO2: false, type: 'OCaml' },
  { id: 23, name: 'Julia', aceMode: 'julia', canO2: false, type: 'Julia' },
  { id: 29, name: 'F# (.NET)', aceMode: 'fsharp', canO2: false, type: 'FSharp' },
  { id: 31, name: 'D', aceMode: 'd', canO2: false, type: 'D' },
]

/**
 * Extract CSRF token from the current page's meta tag.
 * Falls back to window.__guly_user.csrfToken (saved before body clear).
 * The token format is "timestamp:hash" and is sent as X-CSRF-TOKEN header.
 */
export function getCsrfToken(): string {
  // Try the meta tag first (may have been re-injected)
  const meta = document.querySelector('meta[name="csrf-token"]')
  if (meta) return meta.getAttribute('content') || ''
  // Fallback to saved token
  return (window as any).__guly_user?.csrfToken || ''
}

/**
 * Refresh the CSRF token by fetching the homepage (same-origin) and re-parsing
 * <meta name="csrf-token">. The cached token goes stale ("会话超时") after long
 * idle, failing POSTs. Call lazily on auth failure and retry once. Updates both
 * __guly_user.csrfToken and the injected <meta> so getCsrfToken() returns fresh.
 */
export async function refreshCsrf(): Promise<string> {
  try {
    const res = await fetch('https://www.luogu.com.cn/', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/)
    if (m?.[1]) {
      const prev = (window as any).__guly_user || {}
      ;(window as any).__guly_user = { ...prev, csrfToken: m[1] }
      let meta = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null
      if (!meta) { meta = document.createElement('meta'); meta.name = 'csrf-token'; document.head.appendChild(meta) }
      meta.setAttribute('content', m[1])
      return m[1]
    }
  }
  catch (e) { console.warn('[GuluGulu] refreshCsrf failed:', e) }
  return ''
}

/**
 * Check if user is logged in on Luogu.
 */
export function isLoggedIn(): boolean {
  const uid = (window as any).__guly_user?.uid
  return !!uid && uid !== '0'
}

/**
 * Get current user info from stored data.
 */
export function getCurrentUser(): { uid: string } | null {
  const uid = (window as any).__guly_user?.uid
  if (uid && uid !== '0') return { uid }
  return null
}

/**
 * Extract problem data from the lentille-context script tag on the Luogu page.
 * This data is server-side rendered into the HTML.
 */
export function extractProblemData(): any {
  const el = document.getElementById('lentille-context')
  if (el?.textContent?.trim()) {
    try { return JSON.parse(el.textContent) }
    catch (e) { console.warn('[GuluGulu] Failed to parse lentille-context:', e) }
  }
  // Fallback: data was saved before body clear by content script
  const saved = (window as any).__guly_lentille
  if (saved) return saved
  return null
}

export interface SubmitPayload {
  pid: string
  code: string
  lang: number
  enableO2?: boolean
  captcha?: string
  /** When set, appends `?contestId=` to the problem submit URL. */
  contestId?: string | number
}

export interface SubmitResult {
  rid?: number
  status?: number
  errorMessage?: string
  needCaptcha?: boolean
}

/**
 * Submit code directly from the page context (same-origin, proper Referer).
 * Background proxy was rejected by Luogu's origin check.
 */
async function submitOnce(payload: SubmitPayload, csrf: string): Promise<SubmitResult> {

  // Luogu uses a SINGLE submit endpoint for both normal and contest submissions.
  // The /fe/api/contest/submit/{cid}/{pid} route does NOT exist (404 "该页面未找到");
  // contestId is passed as a query param instead.
  const url = new URL(`https://www.luogu.com.cn/fe/api/problem/submit/${payload.pid}`)
  if (payload.contestId != null) url.searchParams.set('contestId', String(payload.contestId))

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json',
        ...(payload.captcha ? { 'X-Captcha': payload.captcha } : {}),
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        code: payload.code,
        lang: payload.lang,
        enableO2: payload.enableO2 ? 1 : 0,
        ...(payload.captcha ? { captcha: payload.captcha } : {}),
      }),
    })

    const contentType = res.headers.get('content-type') || ''
    const text = await res.text()

    // Cloudflare challenge returns HTML
    if (contentType.includes('text/html') || text.includes('cf-browser-verify') || text.includes('Just a moment') || text.includes('__cf')) {
      return { status: 503, errorMessage: '洛谷要求完成人机验证。请先在洛谷任意页面手动刷新一次以完成验证，再返回提交代码。' }
    }

    let data: any
    try { data = JSON.parse(text) } catch {
      return { status: 0, errorMessage: '提交失败：洛谷返回了非预期的响应' }
    }

    // Unknown route / 题目不存在（洛谷 404，data.data 含"该页面未找到"）
    if (data.status === 404 || data.errorCode === 404
      || (typeof data.data === 'string' && (data.data.includes('未找到') || data.data.includes('页面')))) {
      return { status: 404, errorMessage: '提交失败：洛谷返回"未找到"——题目不存在或端点失效，请刷新页面或到洛谷原站提交。' }
    }

    // Success
    if (data.rid || data.data?.rid) {
      return { status: 200, rid: data.rid || data.data?.rid }
    }

    // Luogu captcha required (InvalidCaptchaException) — Cloudflare Turnstile was destroyed when we cleared body
    if (data.errorType?.includes('Captcha') || data.data?.includes('验证码') || data.errorMessage?.includes('验证码')) {
      return { status: 403, errorMessage: '需要人机验证。点击下方按钮打开洛谷验证窗口，完成后关闭即可提交。', needCaptcha: true }
    }

    // "不合法的来源" — origin/referer check failed
    if (data.data?.includes('不合法的来源') || data.errorMessage?.includes('不合法的来源')) {
      return { status: 403, errorMessage: '不合法的来源，请刷新页面后重试。' }
    }

    // Other auth / permission errors
    if (data.status === 403 || data.errorCode === 403) {
      return { status: 403, errorMessage: data.data || data.errorMessage || '请先登录洛谷' }
    }

    return {
      status: data.status || res.status,
      errorMessage: data.errorMessage || data.data || '提交失败',
    }
  }
  catch (e: any) {
    return { status: 0, errorMessage: e.message || '提交请求失败' }
  }
}

export async function submitCode(payload: SubmitPayload): Promise<SubmitResult> {
  let result = await submitOnce(payload, getCsrfToken())
  // 懒刷新:鉴权 403(非验证码)或"会话超时" → 重新取 csrf 重试一次
  const msg = result.errorMessage || ''
  const expired = (result.status === 403 && !result.needCaptcha) || msg.includes('超时')
  if (expired) {
    const fresh = await refreshCsrf()
    if (fresh)
      result = await submitOnce(payload, fresh)
  }
  return result
}

/**
 * Fetch problem data via Luogu's _contentOnly=1 endpoint.
 * Returns raw HTML which can be parsed for lentille-context JSON.
 */
export async function fetchProblemData(pid: string): Promise<any> {
  try {
    const res = await fetch(`https://www.luogu.com.cn/problem/${pid}?_contentOnly=1`, {
      credentials: 'same-origin',
    })
    const html = await res.text()

    // Parse out the lentille-context script
    const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (match?.[1]) {
      return JSON.parse(match[1])
    }
    return null
  }
  catch {
    return null
  }
}

/**
 * Fetch a Luogu page and parse its lentille-context JSON data.
 * Centralizes the 14+ copy-pasted fetch+regex+parse patterns.
 */
export async function fetchLentilleContext(url: string, opts?: { fetcher?: typeof fetch }): Promise<any | null> {
  const f = opts?.fetcher || fetch
  try {
    const res = await f(url, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
    if (m?.[1]) return JSON.parse(m[1])
    // Check if it's a login page — no lentille-context means we're probably not logged in
    if (html.includes('login-form') || html.includes('请先登录') || html.includes('user-login')) return { __needLogin: true }
    return null
  } catch { return null }
}

/**
 * Check if a lentille-context result indicates the user needs to log in.
 */
export function needLogin(ctx: any): boolean {
  return ctx?.__needLogin === true
}

/**
 * Format a fetch/parse error into a user-friendly message.
 * Avoids showing raw `e.message` on the page.
 */
export function friendlyError(e: any): string {
  if (!e) return '未知错误'
  if (typeof e === 'string') return e
  const msg = e.message || String(e)
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return '网络连接失败，请检查网络'
  if (msg.includes('JSON') || msg.includes('Unexpected token') || msg.includes('is not valid JSON'))
    return '请先登录洛谷后再使用 GuluGuly'
  return '加载失败，请先登录洛谷后刷新重试'
}


// === AC-stamp: record verdict polling ===
export type VerdictKind = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'OLE' | 'UKE' | 'Unknown'

export interface VerdictResult {
  rid: number
  state: 'done' | 'timeout' | 'failed'
  verdict: VerdictKind
  score: number | null
  time: number | null // ms
  memory: number | null // KB
  compileMessage: string | null // CE compiler output
  failedCase: { id: number, time: number, memory: number, signal: number | null, exitCode: number } | null
  summary: string
}

function fmtTime(ms: number | null | undefined): string {
  if (ms == null) return ''
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}
function fmtMem(kb: number | null | undefined): string {
  if (kb == null) return ''
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)}MB` : `${kb}KB`
}
function countCases(group: any): number {
  if (!group) return 0
  const fold = (g: any) => (Array.isArray(g) ? g.length : 0)
  if (Array.isArray(group)) return group.reduce((s: number, g: any) => s + fold(g), 0)
  return Object.values(group).reduce((s: number, g: any) => s + fold(g), 0)
}
function flattenCases(subtasks: any): any[] {
  if (!subtasks) return []
  const out: any[] = []
  const list = Array.isArray(subtasks) ? subtasks : Object.values(subtasks || {})
  for (const st of list as any[]) {
    const tc = st?.testCases
    if (!tc) continue
    const cs = Array.isArray(tc) ? tc : Object.values(tc || {})
    out.push(...(cs as any[]))
  }
  return out
}
// Done when compile failed (CE) or all cases judged. Only `12 = AC` and the
// non-terminal nature of status 0..4 are assumed; the rest is structural.
function recordDone(record: any, total: number): boolean {
  // Luogu record.status: 0-3 = pending(Wait/Judging/Compiling/Running),其余为终态
  // (CE/AC/WA/TLE/MLE/RE/OLE/UKE)。CE 记录有时 status 已终态但 detail.compileResult
  // 尚未回填——仅靠 compileResult 判断会轮询到 60s 超时(评测卡住不动)。按终态 status 短路。
  const st = Number(record?.status)
  if (!Number.isNaN(st) && st > 3)
    return true
  const d = record?.detail
  if (!d) return false
  // CE: compile produced a result but there's no judging to wait for. Don't
  // require compileResult.success === false — Luogu's CE record isn't guaranteed
  // to set that field (it may just carry a message), which left CE polling until
  // the 60s timeout → the "评测卡住不动" hang.
  if (d.compileResult && !d.judgeResult) return true
  if (d.compileResult?.success === false) return true
  const jr = d.judgeResult
  if (!jr) return false
  if (total > 0) return (jr.finishedCaseCount ?? 0) >= total
  return record.score != null
}
function summarizeVerdict(rid: number, record: any, total: number, tlim: number | undefined, mlim: number | undefined): VerdictResult {
  const d = record?.detail || {}
  const score = record?.score ?? null
  const time = record?.time ?? null
  const mem = record?.memory ?? null
  const base = { rid, score, time, memory: mem }

  if (d.compileResult && (d.compileResult.success === false || !d.judgeResult))
    return { ...base, state: 'done', verdict: 'CE', compileMessage: d.compileResult.message || null, failedCase: null, summary: 'CE · 编译错误' }

  const cases = flattenCases(d.judgeResult?.subtasks)
  const pass = (c: any) => c?.status === 12
  const allPass = cases.length > 0 ? cases.every(pass) : (score != null && score >= 100)
  if (allPass)
    return { ...base, state: 'done', verdict: 'AC', compileMessage: null, failedCase: null, summary: `AC${(time != null || mem != null) ? ` · ${[fmtTime(time), fmtMem(mem)].filter(Boolean).join(' ')}` : ''}` }

  const fc = cases.find((c: any) => !pass(c)) || null
  let verdict: VerdictKind = 'WA'
  let summary = '未通过'
  if (fc) {
    const sig = fc.signal ?? null
    const exit = fc.exitCode ?? 0
    if ((sig != null && sig !== 0) || exit !== 0) { verdict = 'RE'; summary = `RE · exit ${exit}${sig ? ` signal ${sig}` : ''}` }
    else if (tlim != null && fc.time != null && fc.time > tlim) { verdict = 'TLE'; summary = `TLE · ${fmtTime(fc.time)}` }
    else if (mlim != null && fc.memory != null && fc.memory > mlim) { verdict = 'MLE'; summary = `MLE · ${fmtMem(fc.memory)}` }
    else { verdict = 'WA'; summary = `WA · #${fc.id}` }
  }
  return { ...base, state: 'done', verdict, compileMessage: null, failedCase: fc ? { id: fc.id, time: fc.time, memory: fc.memory, signal: fc.signal ?? null, exitCode: fc.exitCode ?? 0 } : null, summary }
}

/**
 * Poll /record/{rid} (via lentille-context) until judging finishes, then return
 * a normalized verdict for the AC-stamp. `timeLimitMs` / `memoryLimitKB` let the
 * caller (e.g. ProblemDetail, which has problem.limits) refine TLE/MLE; without
 * them, a non-AC/non-CE/non-RE case falls back to WA.
 */
export async function pollRecordVerdict(
  rid: number,
  opts?: { timeLimitMs?: number, memoryLimitKB?: number, maxWaitMs?: number, intervalMs?: number },
): Promise<VerdictResult> {
  const maxWait = opts?.maxWaitMs ?? 60_000
  const interval = opts?.intervalMs ?? 1500
  const deadline = Date.now() + maxWait
  let lastCtx: any = null
  while (Date.now() < deadline) {
    const ctx = await fetchLentilleContext(`https://www.luogu.com.cn/record/${rid}`)
    if (ctx && !ctx.__needLogin) {
      lastCtx = ctx
      const record = ctx?.data?.record
      const total = countCases(ctx?.data?.testCaseGroup)
      console.debug('[GuluGulu] poll record', rid, 'status=', record?.status, 'total=', total, 'done=', record ? recordDone(record, total) : false)
      if (record && recordDone(record, total)) return summarizeVerdict(rid, record, total, opts?.timeLimitMs, opts?.memoryLimitKB)
    }
    await new Promise<void>(r => setTimeout(r, interval))
  }
  if (lastCtx?.data?.record) {
    const total = countCases(lastCtx.data.testCaseGroup)
    const rec = lastCtx.data.record
    if (recordDone(rec, total)) return summarizeVerdict(rid, rec, total, opts?.timeLimitMs, opts?.memoryLimitKB)
    return { ...summarizeVerdict(rid, rec, total, opts?.timeLimitMs, opts?.memoryLimitKB), state: 'timeout', summary: '评测较慢,请稍后在记录页查看' }
  }
  return { rid, state: 'timeout', verdict: 'Unknown', score: null, time: null, memory: null, compileMessage: null, failedCase: null, summary: '评测超时,请在记录页查看' }
}


// === IDE self-test verdict parsing ===
export interface IdeExecResult {
  verdict: string
  output: string
  message: string | null
  time: number | null
  memory: number | null
}

/**
 * Parse an ide_submit `execute` WS message into a verdict + display fields.
 * The execute-message shape for CE/TLE/MLE is undocumented, so those are
 * detected heuristically: TLE/MLE by error text, CE by error-with-no-exit-code
 * or compiler markers, RE by non-zero exit / runtime error. AC/WA compare the
 * run output to the user-supplied expected output.
 */
export function parseIdeExecute(exec: any, msg: any, expected: string): IdeExecResult {
  const time = exec?.cpu_time ?? exec?.time ?? null
  const memory = exec?.memory ?? null
  const err: string | null = exec?.error ? String(exec.error) : null
  const exit = exec?.exit_code
  const out: string = msg?.output ?? ''

  if (err) {
    const low = err.toLowerCase()
    if (/tim(e|ing)|超时|时间|time limit/.test(low)) return { verdict: 'TLE', output: err, message: err, time, memory }
    if (/mem(ory)?|内存|memory limit/.test(low)) return { verdict: 'MLE', output: err, message: err, time, memory }
    if (exit == null || /error:|编译|undefined reference|collect2:|expected|cannot find/.test(low))
      return { verdict: 'CE', output: err, message: err, time, memory }
    return { verdict: 'RE', output: err, message: err, time, memory }
  }
  if (exit != null && exit !== 0) return { verdict: 'RE', output: out || '(no output)', message: `exit ${exit}`, time, memory }
  if (expected.trim()) return { verdict: out.trim() === expected.trim() ? 'AC' : 'WA', output: out || '(no output)', message: null, time, memory }
  return { verdict: '运行完成', output: out || '(no output)', message: null, time, memory }
}

export function ideExecLabel(r: IdeExecResult): string {
  const t = r.time != null ? `${r.time}ms` : ''
  const m = r.memory != null ? (r.memory >= 1024 ? `${(r.memory / 1024).toFixed(2)}MB` : `${r.memory}KB`) : ''
  const extra = [t, m].filter(Boolean).join(' ')
  return extra ? `${r.verdict} · ${extra}` : r.verdict
}


/** 从编译/运行报错文本里提取行号(gcc/clang 的 `:line:col:` 与 `line N` 等)。 */
export function parseErrorLines(msg: string | null | undefined): number[] {
  if (!msg)
    return []
  const set = new Set<number>()
  for (const m of msg.matchAll(/:(\d{1,4})(?::\s*\d{1,3})?:\s*(?:error|fatal error|note|warning|错误)/gi))
    set.add(Number(m[1]))
  for (const m of msg.matchAll(/line\s+(\d{1,4})/gi))
    set.add(Number(m[1]))
  return [...set].filter(n => n >= 1).sort((a, b) => a - b).slice(0, 20)
}


// 洛谷记录状态枚举(权威,来自 Luogu frontend recordStatus)
export const RECORD_STATUS_MAP: Record<number, { label: string, color: string }> = {
  0: { label: 'Waiting', color: '#909399' },
  1: { label: 'Judging', color: '#3498db' },
  2: { label: 'Compiling', color: '#3498db' },
  3: { label: 'Running', color: '#3498db' },
  4: { label: 'AC', color: '#52c41a' },
  5: { label: 'WA', color: '#e74c3c' },
  6: { label: 'WA', color: '#e74c3c' },
  7: { label: 'TLE', color: '#f39c12' },
  8: { label: 'MLE', color: '#f39c12' },
  9: { label: 'RE', color: '#e74c3c' },
  10: { label: 'CE', color: '#e74c3c' },
  11: { label: 'OLE', color: '#f39c12' },
  12: { label: 'AC', color: '#52c41a' },
  14: { label: 'WA', color: '#e74c3c' },
}
