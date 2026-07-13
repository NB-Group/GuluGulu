import fs from 'node:fs'
import path from 'node:path'
import { isFirefox, isSafari, r } from './utils'

const outDir = r(isFirefox ? 'extension-firefox' : isSafari ? 'extension-safari' : 'extension')

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name)
    if (entry.isDirectory()) { walk(fp) }
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.json')) {
      const data = fs.readFileSync(fp, 'utf-8')
      const converted = data.replace(/[^\x00-\x7F]/g, (c) => {
        const cp = c.codePointAt(0)!
        return cp <= 0xffff ? `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}` : `\\u{${cp.toString(16).toUpperCase()}}`
      })
      if (converted !== data) {
        fs.writeFileSync(fp, converted, 'utf-8')
        console.log(`  ascii: ${path.relative(outDir, fp)} (${data.length - converted.length} chars converted)`)
      }
    }
  }
}

console.log(`Converting ${outDir}/ to ASCII-only...`)
walk(outDir)
console.log('Done.')
