import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js/lib/core'
import cpp from 'highlight.js/lib/languages/cpp'
import c from 'highlight.js/lib/languages/c'
import java from 'highlight.js/lib/languages/java'
import python from 'highlight.js/lib/languages/python'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import csharp from 'highlight.js/lib/languages/csharp'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import kotlin from 'highlight.js/lib/languages/kotlin'
import ruby from 'highlight.js/lib/languages/ruby'
import php from 'highlight.js/lib/languages/php'
import lua from 'highlight.js/lib/languages/lua'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import markdownLang from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'

// Register only the languages Luogu content realistically uses (submit langs +
// common doc langs) instead of the full ~37-language common bundle.
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', c)
hljs.registerLanguage('java', java)
hljs.registerLanguage('python', python)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('php', php)
hljs.registerLanguage('lua', lua)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('markdown', markdownLang)
hljs.registerLanguage('plaintext', plaintext)
import katex from 'katex'
// @ts-ignore
import katexCSS from 'katex/dist/katex.min.css?raw'
// @ts-ignore
import hljsLightCSS from 'highlight.js/styles/github.css?raw'
// @ts-ignore
import hljsDarkCSS from 'highlight.js/styles/github-dark.css?raw'

// ============================================================
// Inject KaTeX CSS and Highlight.js CSS into Shadow DOM (once)
// ============================================================
let cssInjected = false
let hljsLightEl: HTMLStyleElement | null = null
let hljsDarkEl: HTMLStyleElement | null = null

export function injectKatexCSS() {
  if (cssInjected) return
  try {
    const host = document.querySelector('#guly')?.shadowRoot
    if (host) {
      const kaTeXStyle = document.createElement('style')
      kaTeXStyle.textContent = katexCSS
      host.appendChild(kaTeXStyle)

      // Light theme (default visible)
      hljsLightEl = document.createElement('style')
      hljsLightEl.textContent = hljsLightCSS
      hljsLightEl.id = 'guly-hljs-light'
      host.appendChild(hljsLightEl)

      // Dark theme (hidden by default)
      hljsDarkEl = document.createElement('style')
      hljsDarkEl.textContent = hljsDarkCSS
      hljsDarkEl.id = 'guly-hljs-dark'
      hljsDarkEl.disabled = true
      host.appendChild(hljsDarkEl)

      // Toggle on theme change
      const observer = new MutationObserver(() => {
        const isDark = document.querySelector('#guly')?.classList.contains('dark')
        if (hljsLightEl) hljsLightEl.disabled = !!isDark
        if (hljsDarkEl) hljsDarkEl.disabled = !isDark
      })
      observer.observe(document.querySelector('#guly')!, { attributes: true, attributeFilter: ['class'] })

      cssInjected = true
    }
  } catch {}
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
  // Block math: $$...$$
  text = text.replace(/\$\$([^$]+)\$\$/g, (_match, formula) => {
    try {
      return katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false, trust: true })
    } catch { return _match }
  })
  // Inline math: $...$ (single $ only)
  text = text.replace(/\$([^$]+?)\$/g, (_match, formula) => {
    try {
      return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false, trust: true })
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
  const withLatex = renderLatexRaw(raw)
  return marked.parse(withLatex) as string
}

/**
 * Parse blog/discuss/contest markdown content with LaTeX + code highlighting.
 * Used by Blog and ContestDetail.
 */
export function parseMarkdownContent(md: string): string {
  if (!md) return ''
  injectKatexCSS()
  try {
    const withLatex = renderLatexRaw(md)
    return marked.parse(withLatex) as string
  } catch { return md }
}
