import { defineConfig } from 'vite'

import packageJson from './package.json'
import { isDev, isFirefox, isSafari, r } from './scripts/utils'
import { sharedConfig } from './vite.config'

// bundling the content script using Vite
// Post-process plugin: escape non-ASCII chars for Chrome's strict UTF-8 validator
function asciiOnlyPlugin() {
  return {
    name: 'ascii-only',
    enforce: 'post' as const,
    generateBundle(_opts: any, bundle: any) {
      for (const fileName in bundle) {
        const chunk = bundle[fileName]
        if (chunk.type === 'chunk' && fileName.endsWith('.js')) {
          const code: string = chunk.code
          // Replace non-ASCII chars with \uXXXX escapes
          // eslint-disable-next-line no-control-regex
          chunk.code = code.replace(/[^\x00-\x7F]/g, (c: string) => {
            const cp = c.codePointAt(0)!
            return cp <= 0xFFFF ? `\\u${cp.toString(16).padStart(4, '0')}` : `\\u{${cp.toString(16)}}`
          })
        }
      }
    },
  }
}

export default defineConfig({
  ...sharedConfig,
  esbuild: {
    charset: 'ascii',
  },
  plugins: [...(sharedConfig.plugins || []), asciiOnlyPlugin()],
  build: {
    watch: isDev ? { include: ['./**/*'] } : undefined,
    outDir: r(
      isFirefox
        ? 'extension-firefox/dist/contentScripts'
        : isSafari
          ? 'extension-safari/dist/contentScripts'
          : 'extension/dist/contentScripts',
    ),
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
    lib: {
      entry: r('src/contentScripts/index.ts'),
      name: packageJson.name,
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        entryFileNames: 'index.global.js',
        extend: true,
      },
    },
  },
})
