import { marked } from 'marked'
import hljs from 'highlight.js'
import katex from 'katex'
// @ts-ignore
import katexCSS from 'katex/dist/katex.min.css?raw'

// ============================================================
// Inject KaTeX CSS into Shadow DOM (once)
// ============================================================
let cssInjected = false
export function injectKatexCSS() {
  if (cssInjected) return
  try {
    const host = document.querySelector('#guly')?.shadowRoot
    if (host) {
      const style = document.createElement('style')
      style.textContent = katexCSS
      host.appendChild(style)
      cssInjected = true
    }
  } catch {}
}

// ============================================================
// Configure marked
// ============================================================
marked.setOptions({
  highlight(code: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(code, { language: lang }).value } catch {}
    }
    try { return hljs.highlightAuto(code).value } catch { return code }
  },
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
