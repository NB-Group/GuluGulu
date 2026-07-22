// generate stub index.html files for dev entry
import { execSync } from 'node:child_process'
import path from 'node:path'

import chokidar from 'chokidar'
import fs from 'fs-extra'

import { isDev, isFirefox, isSafari, log, r } from './utils'

/**
 * Monaco's ESM build `import`s ~90 `.css` files as JS modules. A raw browser
 * ESM context (no bundler) rejects CSS-as-module (`Failed to load module …
 * MIME type text/css`). We strip those side-effect imports from the copied
 * tree and instead concatenate all CSS into one JS module (`_gulu_styles.js`)
 * that the content script injects into the editor's shadow root at runtime.
 * Relative url() refs (codicon font) are rewritten to a placeholder the
 * runtime swaps for the chrome-extension base URL.
 */
function flattenMonacoCss(esmDir: string) {
  const cssChunks: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!entry.name.endsWith('.js'))
        continue
      const src = fs.readFileSync(full, 'utf8')
      // strip side-effect CSS imports: import './foo.css';  (Monaco uses only these)
      const stripped = src.replace(/import\s+['"][^'"]+\.css['"];?[ \t]*\r?\n?/g, '')
      if (stripped !== src)
        fs.writeFileSync(full, stripped)
    }
  }
  walk(esmDir)
  // collect CSS with url() → __GULY_MONACO_BASE__/<path-from-esm-root>/<ref>
  const collect = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { collect(full); continue }
      if (!entry.name.endsWith('.css'))
        continue
      let css = fs.readFileSync(full, 'utf8')
      const relDir = path.relative(esmDir, path.dirname(full)).split(path.sep).join('/')
      css = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (_m, q: string, ref: string) => {
        if (/^data:|^https?:|^__GULY/i.test(ref) || /^[a-z][a-z0-9+.-]*:/i.test(ref))
          return `url(${q}${ref}${q})`
        const abs = relDir ? `${relDir}/${ref}` : ref
        return `url(${q}__GULY_MONACO_BASE__/${abs}${q})`
      })
      cssChunks.push(css)
    }
  }
  collect(esmDir)
  fs.writeFileSync(path.join(esmDir, '_gulu_styles.js'), `export default ${JSON.stringify(cssChunks.join('\n'))};\n`)
  log('PRE', `monaco css flattened: ${cssChunks.length} files → _gulu_styles.js`)

  // Monaco 0.56 dom.js calls `customElements.get(...)` at module-eval time.
  // In the content-script worker / about:blank frame `customElements` is null,
  // which crashes the whole editor.api import. Guard it — the
  // connection-observer custom element is a non-essential optimization.
  const domFile = path.join(esmDir, 'vs/base/browser/dom.js')
  if (fs.existsSync(domFile)) {
    let dom = fs.readFileSync(domFile, 'utf8')
    dom = dom.replace(
      /if\s*\(!customElements\.get\(['"]connection-observer['"]\)\)/,
      'if (typeof customElements !== \'undefined\' && customElements && !customElements.get(\'connection-observer\'))',
    )
    fs.writeFileSync(domFile, dom)
  }
}

/**
 * Stub index.html to use Vite in development
 */
async function stubIndexHtml() {
  const views = [
    'options',
    'popup',
  ]

  for (const view of views) {
    await fs.ensureDir(r(
      isFirefox
        ? `extension-firefox/dist/${view}`
        : isSafari ? `extension-safari/dist/${view}` : `extension/dist/${view}`,
    ))
    let data = await fs.readFile(r(`src/${view}/index.html`), 'utf-8')
    data = data
      .replace('"./main.ts"', `"/${view}/main.ts.js"`)
      .replace('<div id="app"></div>', '<div id="app">Vite server did not start</div>')
    await fs.writeFile(r(
      isFirefox
        ? `extension-firefox/dist/${view}/index.html`
        : isSafari ? `extension-safari/dist/${view}/index.html` : `extension/dist/${view}/index.html`,
    ), data, 'utf-8')
    log('PRE', `stub ${view}`)
  }
}

function writeManifest() {
  execSync('npx esno ./scripts/manifest.ts', { stdio: 'inherit' })
}

fs.ensureDirSync(r(isFirefox ? 'extension-firefox' : isSafari ? 'extension-safari' : 'extension'))
fs.copySync(r('assets'), r(isFirefox ? 'extension-firefox/assets' : isSafari ? 'extension-safari/assets' : 'extension/assets'))
// katex 外置:运行时按需 import,需作为 web-accessible 资源随扩展发布(assets/* 已在 war)
fs.copySync(r('node_modules/katex/dist/katex.mjs'), r(isFirefox ? 'extension-firefox/assets/katex.mjs' : isSafari ? 'extension-safari/assets/katex.mjs' : 'extension/assets/katex.mjs'))
// monaco 外置(IDE 代码编辑器):整个 esm 树原样拷(保持内部相对 import 可解析),
// 经典版 editor.worker 单独拷(避免 ESM worker 在 MV3 CSP 下的不确定性)。
{
  const base = isFirefox ? 'extension-firefox' : isSafari ? 'extension-safari' : 'extension'
  // whole ESM tree (editor API + languages + the ESM editor.worker, which is
  // loaded as a module worker). The classic min worker is AMD-only and can't
  // run under MV3 without the AMD loader, so we don't use it.
  fs.copySync(r('node_modules/monaco-editor/esm'), r(`${base}/assets/monaco/esm`))
  // strip CSS-as-module imports (browser rejects them) + flatten to one injected stylesheet
  flattenMonacoCss(r(`${base}/assets/monaco/esm`))
  // tree-sitter (real C/C++ syntax diagnostics): 0.20 runtime + matching grammars
  fs.copySync(r('node_modules/web-tree-sitter/tree-sitter.wasm'), r(`${base}/assets/tree-sitter/tree-sitter.wasm`))
  fs.copySync(r('node_modules/tree-sitter-wasms/out/tree-sitter-c.wasm'), r(`${base}/assets/tree-sitter/tree-sitter-c.wasm`))
  fs.copySync(r('node_modules/tree-sitter-wasms/out/tree-sitter-cpp.wasm'), r(`${base}/assets/tree-sitter/tree-sitter-cpp.wasm`))
}
writeManifest()

if (isDev) {
  stubIndexHtml()
  chokidar.watch(r('src/**/*.html'))
    .on('change', () => {
      stubIndexHtml()
    })
  chokidar.watch([r('src/manifest.ts'), r('package.json')])
    .on('change', () => {
      writeManifest()
    })
}
