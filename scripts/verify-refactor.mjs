// Verify the 2026-07-17 lightweighting refactor introduced no rendering
// regressions. Loads the built extension (headed), checks fonts / KaTeX /
// icons / hljs on a real Luogu page. Run: node scripts/verify-refactor.mjs [pid]
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const EXT = '/home/shu/code/GuluGulu/extension'
const PROFILE = process.env.PW_PROFILE || '/home/shu/.claude/jobs/5d5fcbbb/tmp/pw-profile'
const HOME = 'https://www.luogu.com.cn/'
// Candidate problems likely to contain KaTeX math; first one with .katex wins.
const MATH_PIDS = process.argv[2] ? [process.argv[2]] : ['P1045', 'P3807', 'P1025', 'P1088']

mkdirSync(PROFILE, { recursive: true })

const results = []
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail })
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const isLoggedIn = async ctx => {
  const cs = await ctx.cookies('https://www.luogu.com.cn/')
  return cs.some(c => c.name === '_uid' || c.name === '__client_id')
}

// Poll for the extension shadow root (mount can take a while cold).
async function waitForMount(page, ms = 60000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const ok = await page.evaluate(() => !!document.querySelector('#gulu')?.shadowRoot)
    if (ok) return true
    await sleep(1000)
  }
  return false
}

// Run an inline fn inside the page with access to the shadow root + document.
async function evalShadow(page, fn) {
  return page.evaluate(fnSrc => {
    const sr = document.querySelector('#gulu')?.shadowRoot
    if (!sr) return { __noShadow: true }
    // eslint-disable-next-line no-new-func
    return (new Function('sr', 'document', `return (${fnSrc})(sr, document)`))(sr, document)
  }, fn.toString())
}

console.log('Launching headed chromium with extension...')
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'],
})
const page = await ctx.newPage()

// ---- login (existing profile cookies, else manual login in the window) ----
await page.goto(HOME, { waitUntil: 'domcontentloaded' }).catch(() => {})
if (!(await isLoggedIn(ctx))) {
  console.log('未登录 — 请在弹出窗口登录洛谷（最多等 4 分钟）…')
  await page.goto('https://www.luogu.com.cn/auth/login').catch(() => {})
  for (let i = 0; i < 80; i++) {
    await sleep(3000)
    if (await isLoggedIn(ctx)) break
  }
}
check('登录态', await isLoggedIn(ctx), await isLoggedIn(ctx) ? '已登录' : '仍未登录（后续断言可能受影响）')

// ---- HOME: fonts + icons ----
console.log('\n[首页] https://www.luogu.com.cn/')
await page.goto(HOME, { waitUntil: 'domcontentloaded' }).catch(() => {})
const homeMounted = await waitForMount(page)
check('#gulu shadow 挂载', homeMounted)

if (homeMounted) {
  const fontCheck = await page.evaluate(async () => {
    try { await document.fonts.load('16px "ShangguSansSCVF"') } catch {}
    return { shanggu: document.fonts.check('16px "ShangguSansSCVF"') }
  })
  check('ShangguSansSC 字体可加载', fontCheck.shanggu)

  const cjkFont = await evalShadow(page, (sr, document) => {
    const walker = document.createTreeWalker(sr, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walker.nextNode())) {
      const t = n.textContent || ''
      if (/[一-鿿]/.test(t) && n.parentElement) {
        const el = n.parentElement
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          return { fontFamily: getComputedStyle(el).fontFamily, sample: t.slice(0, 12) }
        }
      }
    }
    return null
  })
  check('CJK 元素字体栈含 ShangguSansSCVF',
    cjkFont && cjkFont.fontFamily.includes('ShangguSansSCVF'),
    cjkFont ? `"${cjkFont.sample}" → ${cjkFont.fontFamily.slice(0, 60)}` : '未找到可见 CJK 文本')

  const iconCount = await evalShadow(page, sr => sr.querySelectorAll('svg[role="img"]').length)
  check('图标 SVG 渲染（shadow 内）', iconCount > 3, `svg[role=img] × ${iconCount}`)
}

// ---- PROBLEM statement: KaTeX ----
let katexOk = false
let katexPid = null
for (const pid of MATH_PIDS) {
  const url = `https://www.luogu.com.cn/problem/${pid}`
  console.log(`\n[题目] ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {})
  const mounted = await waitForMount(page)
  if (!mounted) { check(`挂载(${pid})`, false, 'shadow 未出现'); continue }

  await sleep(4000) // let markdown/KaTeX render

  const probe = await evalShadow(page, sr => ({
    katex: sr.querySelectorAll('.katex').length,
    hljsCode: sr.querySelectorAll('pre code.hljs, code.hljs').length,
    hljsKeyword: sr.querySelectorAll('.hljs-keyword,.hljs-title,.hljs-built_in,.hljs-type').length,
  }))

  if (probe.katex > 0) {
    katexOk = true
    katexPid = pid
    const katexFont = await page.evaluate(async () => {
      try { await document.fonts.load('16px "KaTeX_Main"') } catch {}
      return document.fonts.check('16px "KaTeX_Main"')
    })
    check('KaTeX 公式渲染 (.katex)', true, `${pid}: ${probe.katex} 个 .katex`)
    check('KaTeX_Main 字体已加载', katexFont, katexFont ? 'ok' : '字体未加载（可能 404）')
    break
  }
  console.log(`  · ${pid}: 无 .katex（换下一题）`)
}
if (!katexOk) {
  check('KaTeX 公式渲染', false, `候选题 ${MATH_PIDS.join('/')} 均无 .katex，请手动指定含公式 pid`)
}

// ---- SOLUTION page: hljs (solutions reliably contain fenced code blocks) ----
const hljsPid = katexPid || MATH_PIDS[0]
const solUrl = `https://www.luogu.com.cn/problem/${hljsPid}/solution`
console.log(`\n[题解] ${solUrl}`)
await page.goto(solUrl, { waitUntil: 'domcontentloaded' }).catch(() => {})
if (await waitForMount(page)) {
  await sleep(5000) // let solution markdown + hljs render
  const hp = await evalShadow(page, sr => ({
    raw: sr.querySelectorAll('pre code').length,
    hljs: sr.querySelectorAll('pre code.hljs, code.hljs').length,
    tok: sr.querySelectorAll('.hljs-keyword,.hljs-title,.hljs-built_in,.hljs-type').length,
  }))
  if (hp.raw === 0) {
    check('代码块 hljs 高亮', false, '题解页无 pre code（可能未登录/未渲染）')
  } else {
    check('代码块 hljs 高亮', hp.hljs > 0, `${hp.hljs}/${hp.raw} 个 code 带 hljs`)
    check('hljs 高亮 span', hp.tok > 0, `${hp.tok} 个高亮 token`)
  }
} else {
  check('代码块 hljs 高亮', false, '题解页 shadow 未挂载')
}

// ---- report ----
const passed = results.filter(r => r.pass).length
const failed = results.filter(r => !r.pass)
console.log(`\n==== ${passed}/${results.length} 通过 ====`)
if (failed.length) {
  console.log('失败项：')
  failed.forEach(r => console.log(`  ✗ ${r.name}${r.detail ? ' — ' + r.detail : ''}`))
}

await ctx.close()
process.exit(failed.length ? 1 : 0)
