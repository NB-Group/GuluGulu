// generate stub index.html files for dev entry
import { execSync } from 'node:child_process'

import chokidar from 'chokidar'
import fs from 'fs-extra'

import { isDev, isFirefox, isSafari, log, r } from './utils'

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
