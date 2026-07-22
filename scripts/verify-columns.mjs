// Verify dual/single column switching fix on UserProfile (representative; the
// sticky mechanism is shared with ContestDetail). Loads the built extension,
// sweeps 3 widths, screenshots, and probes sidebar/main geometry + sticky.
import { chromium } from 'playwright'

const EXT = '/home/shu/code/GuluGulu/extension'
const PROFILE = '/home/shu/.claude/jobs/62200740/tmp/pw-profile'
const URL_ = process.argv[2] || 'https://www.luogu.com.cn/user/1'
const WIDTHS = [375, 1024, 1280]

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'],
})
const page = await ctx.newPage()

const sleep = ms => new Promise(r => setTimeout(r, ms))

for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 })
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  await page.waitForFunction(() => !!document.querySelector('#gulu')?.shadowRoot, { timeout: 45000 }).catch(() => {})
  await sleep(4500) // let profile + layout render

  const geom = await page.evaluate(() => {
    const sr = document.querySelector('#gulu')?.shadowRoot
    if (!sr) return { mounted: false }
    const side = sr.querySelector('.profile-sidebar-col')
    const main = side?.nextElementSibling
    const a = side?.getBoundingClientRect?.()
    const b = main?.getBoundingClientRect?.()
    const osvp = sr.querySelector('.os-viewport') || sr.querySelector('[data-overlayscrollbars-viewport]')
    return {
      mounted: true,
      sideW: Math.round(a?.width || 0),
      sideLeft: Math.round(a?.left || 0),
      sideTop: Math.round(a?.top || 0),
      mainW: Math.round(b?.width || 0),
      mainLeft: Math.round(b?.left || 0),
      stacked: a && b ? a.left === b.left : null,
      hasOsViewport: !!osvp,
    }
  })

  let sticky = 'n/a'
  if (w >= 1024 && geom.hasOsViewport) {
    await page.evaluate(() => {
      const sr = document.querySelector('#gulu')?.shadowRoot
      const vp = sr.querySelector('.os-viewport') || sr.querySelector('[data-overlayscrollbars-viewport]')
      if (vp) vp.scrollTop = 700
    })
    await sleep(600)
    const topAfter = await page.evaluate(() => {
      const sr = document.querySelector('#gulu')?.shadowRoot
      return Math.round(sr.querySelector('.profile-sidebar-col')?.getBoundingClientRect()?.top || 0)
    })
    sticky = `topAfterScroll=${topAfter} (held=${topAfter > 0 && topAfter < 250})`
  }

  await page.screenshot({ path: `/tmp/col-${w}.png` })
  console.log(`\n[w=${w}] ${JSON.stringify(geom)}`)
  console.log(`  sticky: ${sticky}`)
}

console.log('\n截图: /tmp/col-375.png  /tmp/col-1024.png  /tmp/col-1280.png')
await ctx.close()
process.exit(0)
