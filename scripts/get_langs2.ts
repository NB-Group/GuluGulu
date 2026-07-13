import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({ userAgent: 'Mozilla/5.0 ... Chrome/120.0.0.0' })).newPage()

  // Get the full config which includes language definitions
  const configRes = await page.request.get('https://www.luogu.com.cn/_lfe/config?_version=1782831299')
  const configText = await configRes.text()

  // Extract the Languages section
  const langSection = configText.match(/"Languages":\{.*?\}(?=,\s*"[A-Z])/s)
  if (langSection) {
    // Parse as JSON to get clean data
    const wrapped = '{' + langSection[0] + '}'
    try {
      const parsed = JSON.parse(wrapped)
      const langs = parsed.Languages
      console.log(`Found ${Object.keys(langs).length} languages:\n`)
      // Sort by order
      const sorted = Object.entries(langs).sort((a: any, b: any) => a[1].order - b[1].order)
      for (const [id, info] of sorted) {
        const l = info as any
        if (l.disabled) continue
        console.log(`  ${id}: ${l.name} (family: ${l.family}, canO2: ${l.canO2}, aceMode: ${l.aceMode}, type: ${l.type})`)
      }
    } catch(e) {
      console.log('Parse error:', e)
      console.log('Raw:', langSection[0].slice(0, 3000))
    }
  } else {
    console.log('No language section found')
    // Try broader search
    const idx = configText.indexOf('"Languages"')
    console.log('"Languages" found at index', idx)
    console.log('Context:', configText.slice(idx, idx + 3000))
  }

  await browser.close()
}

main().catch(console.error)
