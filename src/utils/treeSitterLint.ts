/* eslint-disable style/max-statements-per-line */
import Parser from 'web-tree-sitter'
import browser from 'webextension-polyfill'

/**
 * Real C/C++ syntax diagnostics via tree-sitter (WASM).
 *
 * Uses web-tree-sitter 0.20.x + tree-sitter-wasms (0.20-era grammars) — these
 * ABI-match; newer web-tree-sitter (0.26) rejects the 0.20 grammars with
 * "need dylink section".
 *
 * tree-sitter builds a real syntax tree and surfaces ERROR / MISSING nodes,
 * catching missing semicolons, malformed statements, bad declarations, etc.
 * Main-thread parse of a single source file is sub-millisecond. Returns
 * Monaco-shaped markers (no severity — caller adds MarkerSeverity).
 */

let initPromise: Promise<void> | null = null
const parsers: Partial<Record<'c' | 'cpp', any>> = {}

function ensureInit(): Promise<void> {
  if (!initPromise) {
    // 0.20 API: Parser.init(moduleOptions) with locateFile → runtime wasm.
    initPromise = (Parser as any).init({
      locateFile: () => browser.runtime.getURL('/assets/tree-sitter/tree-sitter.wasm'),
    }).catch((e: any) => { initPromise = null; throw e })
  }
  return initPromise
}

async function getParser(lang: 'c' | 'cpp'): Promise<any> {
  await ensureInit()
  if (parsers[lang])
    return parsers[lang]
  const file = lang === 'cpp' ? 'tree-sitter-cpp.wasm' : 'tree-sitter-c.wasm'
  // 0.20 API: Parser.Language.load(url)
  const Lang = await (Parser as any).Language.load(browser.runtime.getURL(`/assets/tree-sitter/${file}`))
  const p = new (Parser as any)()
  p.setLanguage(Lang)
  parsers[lang] = p
  return p
}

export interface LintMarker {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  message: string
}

export async function lintCpp(code: string, lang: 'c' | 'cpp' = 'cpp'): Promise<LintMarker[]> {
  if (!code || !code.trim())
    return []
  try {
    const parser = await getParser(lang)
    const tree = parser.parse(code)
    const diags: LintMarker[] = []
    const visit = (node: any) => {
      const type: string = node.type || ''
      if (type === 'ERROR') {
        const s = node.startPosition
        let e = node.endPosition
        if (e.row === s.row && e.column <= s.column)
          e = { row: s.row, column: s.column + 1 }
        diags.push({
          startLineNumber: s.row + 1,
          startColumn: s.column + 1,
          endLineNumber: e.row + 1,
          endColumn: e.column + 1,
          message: '语法错误:无法解析此处',
        })
      }
      else if (type === 'MISSING') {
        const s = node.startPosition
        diags.push({
          startLineNumber: s.row + 1,
          startColumn: s.column + 1,
          endLineNumber: s.row + 1,
          endColumn: s.column + 2,
          message: `缺少 "${node.text || '符号'}"`,
        })
      }
      for (let i = 0; i < (node.childCount || 0); i++) {
        const c = node.child(i)
        if (c)
          visit(c)
      }
    }
    visit(tree.rootNode)
    tree.delete()
    return diags.slice(0, 100)
  }
  catch (e) {
    console.warn('[GuluGulu] tree-sitter lint failed:', e)
    return []
  }
}
