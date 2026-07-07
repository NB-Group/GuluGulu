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
  if (!el?.textContent || !el.textContent.trim()) return null
  try {
    return JSON.parse(el.textContent)
  }
  catch (e) {
    console.warn('[GulyGuly] Failed to parse lentille-context:', e)
    return null
  }
}

export interface SubmitPayload {
  pid: string
  code: string
  lang: number
  enableO2?: boolean
}

export interface SubmitResult {
  rid?: number
  status?: number
  errorMessage?: string
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
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        code: payload.code,
        lang: payload.lang,
        enableO2: payload.enableO2 ? 1 : 0,
      }),
    })

    const data = await res.json()

    if (data.rid || data.data?.rid) {
      return { status: 200, rid: data.rid || data.data?.rid }
    }

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
