import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js/lib/core'
import cpp from 'highlight.js/lib/languages/cpp'
import c from 'highlight.js/lib/languages/c'
import java from 'highlight.js/lib/languages/java'
import python from 'highlight.js/lib/languages/python'
import javascript from 'highlight.js/lib/languages/javascript'
import csharp from 'highlight.js/lib/languages/csharp'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import kotlin from 'highlight.js/lib/languages/kotlin'
import ruby from 'highlight.js/lib/languages/ruby'
import php from 'highlight.js/lib/languages/php'
import lua from 'highlight.js/lib/languages/lua'
import json from 'highlight.js/lib/languages/json'
import plaintext from 'highlight.js/lib/languages/plaintext'

// Register only the languages Luogu content realistically uses (submit langs +
// a minimal set of common doc langs). Cut from 19 → 14: dropped typescript
// (Luogu only accepts JavaScript via Node.js, not TS — auto-detect handles it),
// bash / sql / yaml / markdown (not Luogu submission languages; rare in problem
// statements; highlightAuto() still picks them up when explicitly fenced).
// Each dropped language saves ~5–21 KB raw (~50–60% of that after minify).
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', c)
hljs.registerLanguage('java', java)
hljs.registerLanguage('python', python)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('php', php)
hljs.registerLanguage('lua', lua)
hljs.registerLanguage('json', json)
hljs.registerLanguage('plaintext', plaintext)
import browser from 'webextension-polyfill'

// ============================================================
// Parse cache (LRU, capped at 128 entries)
// ------------------------------------------------------------
// parseMarkdownContent / parseProblemMarkdown are called inside v-html
// bindings, so they re-run on every render. Cache the parsed HTML keyed by
// the raw input to avoid re-running marked + katex on identical input.
//
// CRITICAL: renderLatexRaw returns the raw text unchanged while
// katex === null (before ensureKatex() resolves). A naive cache would pin
// that pre-LaTeX output and math would never render. The whole cache is
// invalidated inside ensureKatex() once katex finishes loading.
// ============================================================
const PARSE_CACHE = new Map<string, string>()
const PARSE_CACHE_MAX = 128
function cacheGet(key: string): string | undefined {
  const v = PARSE_CACHE.get(key)
  if (v !== undefined) {
    // LRU refresh: delete + re-insert moves the entry to the tail (most
    // recently used). Map iterates in insertion order, so the head is the
    // oldest victim when we evict.
    PARSE_CACHE.delete(key)
    PARSE_CACHE.set(key, v)
  }
  return v
}
function cacheSet(key: string, value: string): void {
  if (PARSE_CACHE.has(key)) PARSE_CACHE.delete(key)
  PARSE_CACHE.set(key, value)
  if (PARSE_CACHE.size > PARSE_CACHE_MAX) {
    const oldest = PARSE_CACHE.keys().next().value
    if (oldest !== undefined) PARSE_CACHE.delete(oldest)
  }
}

// katex 外置:不静态打包进内容脚本 IIFE,运行时从 web-accessible 的 /assets/katex.mjs
// 按需加载(内容脚本启动、Vue 挂载前由 ensureKatex() 预取)。renderLatexRaw 仍同步,
// 在 katex 就绪前直接返回原文(降级)。585KB 从主包移出。
type Katex = typeof import('katex')['default']
let katex: Katex | null = null
export async function ensureKatex(): Promise<Katex | null> {
  if (!katex) {
    try {
      katex = (await import(/* @vite-ignore */ browser.runtime.getURL('/assets/katex.mjs'))).default
      // katex just became available — any cached parse output was produced
      // with renderLatexRaw in its pass-through (pre-LaTeX) mode and would
      // pin unrendered math if reused. Drop the whole cache so the next
      // call re-parses with katex active.
      PARSE_CACHE.clear()
    }
    catch (e) { console.warn('[GuluGulu] katex load failed:', e) }
  }
  return katex
}
// @ts-ignore
import katexCSSRaw from 'katex/dist/katex.min.css?raw'
// @ts-ignore
import hljsLightCSS from 'highlight.js/styles/github.css?raw'
// @ts-ignore
import hljsDarkCSS from 'highlight.js/styles/github-dark.css?raw'

// Rewrite KaTeX font urls to extension-absolute paths so they resolve inside
// the Shadow DOM (relative urls would resolve against the host page). Only
// woff2 is shipped (under /assets/fonts/katex/); browsers use the first
// supported src and skip the rest, so the ttf/woff entries are never fetched.
const katexCSS = katexCSSRaw.replace(
  /url\((['"]?)fonts\//g,
  (_m, q: string) => `url(${q}${browser.runtime.getURL('/assets/fonts/katex/')}`,
)

// ============================================================
// Inject KaTeX CSS and Highlight.js CSS into Shadow DOM (once)
// ============================================================
let cssInjected = false
let hljsLightEl: HTMLStyleElement | null = null
let hljsDarkEl: HTMLStyleElement | null = null

export function injectKatexCSS() {
  if (cssInjected) return
  try {
    const host = document.querySelector('#gulu')?.shadowRoot
    if (host) {
      const kaTeXStyle = document.createElement('style')
      kaTeXStyle.textContent = katexCSS
      host.appendChild(kaTeXStyle)

      // Light theme (default visible)
      hljsLightEl = document.createElement('style')
      hljsLightEl.textContent = hljsLightCSS
      hljsLightEl.id = 'gulu-hljs-light'
      host.appendChild(hljsLightEl)

      // Dark theme (hidden by default)
      hljsDarkEl = document.createElement('style')
      hljsDarkEl.textContent = hljsDarkCSS
      hljsDarkEl.id = 'gulu-hljs-dark'
      hljsDarkEl.disabled = true
      host.appendChild(hljsDarkEl)

      // Toggle on theme change
      const observer = new MutationObserver(() => {
        const isDark = document.querySelector('#gulu')?.classList.contains('dark')
        if (hljsLightEl) hljsLightEl.disabled = !!isDark
        if (hljsDarkEl) hljsDarkEl.disabled = !isDark
      })
      observer.observe(document.querySelector('#gulu')!, { attributes: true, attributeFilter: ['class'] })

      cssInjected = true
    }
  } catch (e) { console.warn('[GuluGulu]', e) }
}

// ============================================================
// Configure marked with code highlighting (marked v18 API)
// ============================================================
marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
}))

marked.setOptions({
  breaks: true,
  gfm: true,
})

// ============================================================
// LaTeX rendering (on raw text — before markdown parsing)
// ============================================================
function renderLatexRaw(text: string): string {
  const k = katex
  if (!k)
    return text
  // Block math: $$...$$
  text = text.replace(/\$\$([^$]+)\$\$/g, (_match, formula) => {
    try {
      return k.renderToString(formula.trim(), { displayMode: true, throwOnError: false, trust: true })
    } catch { return _match }
  })
  // Inline math: $...$ (single $ only)
  text = text.replace(/\$([^$]+?)\$/g, (_match, formula) => {
    try {
      return k.renderToString(formula.trim(), { displayMode: false, throwOnError: false, trust: true })
    } catch { return _match }
  })
  return text
}

// ============================================================
// Public API
// ============================================================

/**
 * Parse problem markdown (LaTeX → Markdown → HTML).
 * Used by ProblemDetail.
 */
export function parseProblemMarkdown(raw: string): string {
  injectKatexCSS()
  const cached = cacheGet(raw)
  if (cached !== undefined) return cached
  const withLatex = renderLatexRaw(raw)
  const out = marked.parse(withLatex) as string
  cacheSet(raw, out)
  return out
}

/**
 * Parse blog/discuss/contest markdown content with LaTeX + code highlighting.
 * Used by Blog and ContestDetail.
 */
export function parseMarkdownContent(md: string): string {
  if (!md) return ''
  injectKatexCSS()
  const cached = cacheGet(md)
  if (cached !== undefined) return cached
  try {
    const withLatex = renderLatexRaw(md)
    const out = marked.parse(withLatex) as string
    cacheSet(md, out)
    return out
  } catch { return md }
}
