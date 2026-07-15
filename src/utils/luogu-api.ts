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
export async function submitCode(payload: SubmitPayload): Promise<SubmitResult> {
  const csrf = getCsrfToken()

  try {
    const res = await fetch(`https://www.luogu.com.cn/fe/api/problem/submit/${payload.pid}`, {
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

export async function runIdeCode(opts: {
  code: string; lang: number; input: string; o2: boolean
}): Promise<{ rid?: string; error?: string }> {
  const csrf = getCsrfToken()
  const params = new URLSearchParams({
    code: opts.code, lang: String(opts.lang), input: opts.input,
    o2: opts.o2 ? '1' : '0', 'csrf-token': csrf,
  })
  try {
    const res = await fetch('https://www.luogu.com.cn/api/ide_submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'same-origin',
      body: params.toString(),
    })
    const json = await res.json()
    if (json?.data?.rid) return { rid: String(json.data.rid) }
    return { error: json?.errorMessage || 'IDE 提交失败' }
  } catch (e: any) { return { error: e.message || 'IDE 请求失败' } }
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
    const match = html.match(/<script\s+id="lentille-context"\s+type="application\/json">([^<]+)<\/script>/)
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
