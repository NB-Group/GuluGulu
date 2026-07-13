import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })

  const page = await context.newPage()
  await page.goto('https://www.luogu.com.cn/problem/P1001', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)

  // Extract lentille-context data
  const problemData = await page.evaluate(() => {
    const el = document.getElementById('lentille-context')
    if (!el)
      return null
    try {
      return JSON.parse(el.textContent || '{}')
    }
    catch {
      return null
    }
  })
  if (problemData) {
    console.log('Problem structure keys:', Object.keys(problemData.data.problem))
    console.log('Sample content keys:', Object.keys(problemData.data.problem.contenu))
    console.log('Tags:', problemData.data.problem.tags)
    console.log('Limits:', {
      timeLimit: problemData.data.problem.limits?.time,
      memoryLimit: problemData.data.problem.limits?.memory,
      time: problemData.data.problem.time,
      memory: problemData.data.problem.memory,
    })
    console.log('All top problem keys:', Object.keys(problemData.data.problem))
    // Print a sample of the content
    const c = problemData.data.problem.contenu
    console.log('\nContent subkeys:', Object.keys(c))
  }

  // Find language list from Luogu JS config
  // Try fetching the language list from API
  const configRes = await page.request.get('https://www.luogu.com.cn/_lfe/config?_version=1782831299')
  const configText = await configRes.text()

  // Also try to find languages in the JS bundles
  const langMatches = [...configText.matchAll(/lang[^}]{0,200}/gi)]
  console.log('\nLang-related config entries:')
  for (const m of langMatches.slice(0, 20)) {
    console.log(`  ${m[0].slice(0, 200)}`)
  }

  await browser.close()
}

main().catch(console.error)
