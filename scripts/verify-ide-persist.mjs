// Verify the IDE code-persistence fix on ProblemDetail:
//   (1) With no draft, the editor must NOT be pre-filled with the A+B template.
//   (2) Typed code is mirrored to localStorage (debounced) and survives reload.
// Runs logged-out on a public problem so Luogu's server draft (lastCode) is
// empty — isolating the extension's own load/save paths.
//   node scripts/verify-ide-persist.mjs [pid]
import { chromium } from 'playwright'

const EXT = '/home/shu/code/GuluGulu/extension'
const PROFILE = '/home/shu/.claude/jobs/62200740/tmp/pw-profile-ide'
const PID = process.argv[2] || 'P1001'
const URL = `https://www.luogu.com.cn/problem/${PID}`
const sleep = ms => new Promise(r => setTimeout(r, ms))

// The exact A+B C++ template getDefaultCode(28) used to inject.
const APLUS = '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a + b;\n    cout << a + b << endl;\n    return 0;\n}\n'
const MARKER = `// GULU_PERSIST_TEST_${PID}_ZZZ`

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'],
})
const page = await ctx.newPage()
const results = []
const check = (n, c, d = '') => { results.push({ n, c }); console.log(`  ${c ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`) }

async function waitForMount() {
  await page.waitForFunction(() => !!document.querySelector('#guly')?.shadowRoot, { timeout: 45000 }).catch(() => {})
  await sleep(5000)
}
async function openSubmitTab() {
  // Both the header button and the tab-bar button read "提交代码"; either switches.
  await page.locator('button:has-text("提交代码")').first().click().catch(() => {})
  await sleep(1200)
}
async function editorText() {
  return page.locator('.cm-content').first().innerText().catch(() => '')
}

console.log(`[1] 打开 ${URL}(无草稿路径)`)
await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
await waitForMount()
// Wipe any prior local draft so the load path has nothing to restore.
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('guly:code:')) localStorage.removeItem(k) })
await openSubmitTab()

const initial = (await editorText()).trim()
check('无草稿时编辑器不填 A+B 模板', initial !== APLUS.trim() && initial === '',
  `editor=${JSON.stringify(initial.slice(0, 40))}`)

console.log(`[2] 输入标记代码 → 等防抖落盘`)
await page.locator('.cm-content').first().click()
await page.keyboard.type(MARKER)
await sleep(1100) // > 600ms debounce
const saved = await page.evaluate(k => localStorage.getItem(k), `guly:code:${PID}`)
let savedCode = ''
try { savedCode = saved ? JSON.parse(saved).code : '' } catch {}
check('输入后写入 localStorage', typeof saved === 'string' && savedCode.includes(MARKER),
  `key=guly:code:${PID}, hasMarker=${savedCode.includes(MARKER)}`)

console.log(`[3] 刷新页面 → 验证恢复`)
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await waitForMount()
await openSubmitTab()
const restored = (await editorText()).trim()
check('刷新后编辑器从本地草稿恢复', restored.includes(MARKER),
  `restoredHasMarker=${restored.includes(MARKER)}`)

const passed = results.filter(r => r.c).length
console.log(`\n==== ${passed}/${results.length} 通过 ====`)
await ctx.close()
process.exit(passed === results.length ? 0 : 1)
