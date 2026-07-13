import hljs from 'highlight.js'
import hljsLightCSS from 'highlight.js/styles/github.css?raw'
import hljsDarkCSS from 'highlight.js/styles/github-dark.css?raw'
import katex from 'katex'
import katexCSS from 'katex/dist/katex.min.css?raw'
import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'

// ============================================================
// Inject KaTeX CSS and Highlight.js CSS into Shadow DOM (once)
// ============================================================
let cssInjected = false
let hljsLightEl: HTMLStyleElement | null = null
let hljsDarkEl: HTMLStyleElement | null = null

export function injectKatexCSS() {
  if (cssInjected)
    return
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
        if (hljsLightEl)
          hljsLightEl.disabled = !!isDark
        if (hljsDarkEl)
          hljsDarkEl.disabled = !isDark
      })
      observer.observe(document.querySelector('#guly')!, { attributes: true, attributeFilter: ['class'] })

      cssInjected = true
    }
  }
  catch {}
}

// ============================================================
// Configure marked with code highlighting (marked v18 API)
// ============================================================
marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value
      }
      return hljs.highlightAuto(code).value
    },
  }),
)

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
    }
    catch {
      return _match
    }
  })
  // Inline math: $...$ (single $ only)
  text = text.replace(/\$([^$]+)\$/g, (_match, formula) => {
    try {
      return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false, trust: true })
    }
    catch {
      return _match
    }
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
  if (!md)
    return ''
  injectKatexCSS()
  try {
    const withLatex = renderLatexRaw(md)
    return marked.parse(withLatex) as string
  }
  catch {
    return md
  }
}
