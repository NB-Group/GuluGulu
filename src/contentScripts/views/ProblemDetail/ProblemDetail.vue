<script setup lang="ts">
import { useGulyApp } from '~/composables/useAppProvider'
import { useCodeMirror } from '~/composables/useCodeMirror'
import { AppPage } from '~/enums/appEnums'
import { renderIcon } from '~/utils/icons'
import type { LuoguLanguage } from '~/utils/luogu-api'
import { extractProblemData, fetchProblemData, isLoggedIn as checkLuoguLogin, LUOGU_LANGUAGES, submitCode } from '~/utils/luogu-api'
import { timeAgo } from '~/utils/main'
import { injectKatexCSS, parseProblemMarkdown } from '~/utils/markdown'

const props = defineProps<{
  pid?: string
}>()

const { currentUrl, navigateTo } = useGulyApp()

// ============================================================
// Problem ID — from URL or props
// ============================================================
function extractPidFromUrl(): string {
  // Capture the full pid segment, including external-OJ prefixes that Luogu
  // aggregates (CF1234A, AT_arc123, SP8377, UVA12345, ...). The old [A-Z]?\d+
  // truncated these (CF1234A -> F1234, AT_arc123 -> 123), so the problem failed
  // to load and the UI silently fell back to the A+B (P1001) default.
  const match = (currentUrl.value || document.URL).match(/\/problem\/(\w+)/)
  return match?.[1] || 'P1001'
}
const problemId = computed(() => props.pid || extractPidFromUrl())

// ============================================================
// Problem data loading
// ============================================================
interface ProblemData {
  pid: string
  title: string
  difficulty: number
  difficultyLabel: string
  timeLimit: string
  memoryLimit: string
  tags: Array<{ id: number, name: string }>
  totalSubmit: number
  totalAccepted: number
  background: string
  description: string
  inputFormat: string
  outputFormat: string
  hint: string
  source: string
  samples: Array<{ input: string, output: string, explanation?: string }>
  provider: { uid: number, name: string, avatar: string, color: string } | null
}

const difficultyMap: Record<number, { label: string, color: string }> = {
  0: { label: '暂无评定', color: '#909399' },
  1: { label: '入门', color: '#bfbfbf' },
  2: { label: '普及−', color: '#52c41a' },
  3: { label: '普及/提高−', color: '#3498db' },
  4: { label: '普及+/提高', color: '#f39c12' },
  5: { label: '提高+/省选−', color: '#e74c3c' },
  6: { label: '省选/NOI−', color: '#9b59b6' },
  7: { label: 'NOI/NOI+/CTSC', color: '#262626' },
}

const problem = ref<ProblemData>({
  pid: 'P1001',
  title: 'A+B Problem',
  difficulty: 1,
  difficultyLabel: '入门',
  timeLimit: '1.00s',
  memoryLimit: '125.00MB',
  tags: [],
  totalSubmit: 0,
  totalAccepted: 0,
  background: '',
  description: '加载中...',
  inputFormat: '',
  outputFormat: '',
  hint: '',
  source: '',
  samples: [],
  provider: null,
})

const loading = ref(true)
const loadError = ref(false)
const loadingTimer: ReturnType<typeof setTimeout> | null = null
const discussions = ref<Array<{ id: number, title: string, author: any, time: number, replyCount: number }>>([])
const solutions = ref<Array<{ id: number, title: string, author: any, time: number, votes: number }>>([])
const solutionsLoading = ref(false)
async function loadSolutions() {
  if (solutionsLoading.value)
    return
  solutionsLoading.value = true
  try {
    const res = await fetch(`https://www.luogu.com.cn/problem/solution/${problemId.value}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const list = ctx?.data?.solutions?.result || ctx?.currentData?.solutions?.result || []
      solutions.value = list.map((s) => {
        return {
          id: s.id || 0,
          title: s.title || '',
          author: s.author || {},
          time: s.time || 0,
          votes: s.votes || s.thumbUp || 0,
        }
      })
    }
  }
  catch (e) {}
  solutionsLoading.value = false
}

// Code editor state — declared early to avoid use-before-define with functions below
const selectedLang = ref(LUOGU_LANGUAGES.find(l => l.id === 28) || LUOGU_LANGUAGES[0])
const enableO2 = ref(true)
const codeContent = ref('')

// CodeMirror 6 编辑器宿主(分屏 IDE 视图内挂载/卸载)
const cmHost = ref<HTMLElement>()
useCodeMirror({
  host: cmHost,
  value: codeContent,
  lang: computed(() => selectedLang.value.aceMode),
})

let loadingPid: string | null = null // guard against concurrent loads
let isInitialLoad = true // 只在首次加载填模板,切题时不强行覆盖编辑器
async function loadRealData() {
  const pid = problemId.value
  if (loadingPid === pid)
    return // already loading this problem
  loadingPid = pid
  try {
    let raw = extractProblemData()
    // If DOM data is stale (SPA navigation to a DIFFERENT problem), fetch via _contentOnly=1 API
    const extractedPid = raw?.data?.problem?.pid || raw?.currentData?.problem?.pid
    if ((!raw?.data?.problem && !raw?.currentData?.problem) || (extractedPid && extractedPid !== pid))
      raw = await fetchProblemData(pid)
    // Normalize: _contentOnly=1 uses currentData, HTML pages use data
    const rd: any = raw?.data || raw?.currentData || {}
    if (!rd.problem) {
      // Problem data couldn't be loaded (e.g. external-OJ pid Luogu doesn't
      // host, or not logged in). Show the error UI instead of silently leaving
      // the A+B (P1001) default problem object on screen.
      if (loadingPid === pid) {
        loadError.value = true
        loading.value = false
        loadingPid = null
      }
      return
    }

    const p = rd.problem
    const limits = p.limits || {}
    const timeMs = limits.time?.[0] || 1000
    const memKb = limits.memory?.[0] || 125000

    // Parse samples
    const samples: ProblemData['samples'] = []
    if (Array.isArray(rd.samples || p.samples)) {
      for (const s of (rd.samples || p.samples)) {
        samples.push({ input: s[0] || '', output: s[1] || '', explanation: s[2] || '' })
      }
    }

    problem.value = {
      pid: p.pid,
      title: p.name || p.title || '',
      difficulty: p.difficulty || 0,
      difficultyLabel: difficultyMap[p.difficulty || 0]?.label || '暂无评定',
      timeLimit: `${(timeMs / 1000).toFixed(2)}s`,
      memoryLimit: memKb >= 1024 ? `${(memKb / 1024).toFixed(0)}.00MB` : `${memKb}.00KB`,
      tags: Array.isArray(p.tags) ? p.tags.map((t: any) => (typeof t === 'number' ? { id: t, name: `标签 ${t}` } : t)) : [],
      totalSubmit: p.totalSubmit || 0,
      totalAccepted: p.totalAccepted || 0,
      background: p.contenu?.background || p.content?.background || '',
      description: [p.contenu?.description || p.content?.description || ''].join('\n\n'),
      inputFormat: p.contenu?.formatI || p.content?.formatI || '',
      outputFormat: p.contenu?.formatO || p.content?.formatO || '',
      hint: p.contenu?.hint || p.content?.hint || '',
      source: p.content?.source || '',
      samples,
      provider: p.provider || null,
    }

    // Extract discussions from the same lentille-context
    const discList = rd.discussions
    if (Array.isArray(discList)) {
      discussions.value = discList.map((d: any) => ({
        id: d.id || 0,
        title: d.title || '',
        author: d.author || {},
        time: d.time || 0,
        replyCount: d.replyCount || d.reply_count || 0,
      }))
    }

    // Load saved code from Luogu (lastCode / lastLanguage). Only auto-fill a
    // starter template on the first load — on problem-switch leave empty when
    // there's no saved code, so we don't clobber the editor with A+B.
    const savedCode: string = rd.lastCode || ''
    const savedLang: number | undefined = rd.lastLanguage
    codeContent.value = savedCode || (isInitialLoad ? getDefaultCode(savedLang || 28) : '')
    isInitialLoad = false
    if (savedLang) {
      const found = LUOGU_LANGUAGES.find(l => l.id === savedLang)
      if (found)
        selectedLang.value = found
    }

    if (loadingPid !== pid)
      return // stale result from SPA race
    document.title = `${problem.value.pid} ${problem.value.title} - GuluGulu`
    loading.value = false
    loadingPid = null
  }
  catch (e) {
    console.error('[GuluGulu] Failed to load problem data:', e)
    if (loadingPid === pid) { loadError.value = true; loading.value = false; loadingPid = null }
  }
}

// ============================================================
// Submission state
// ============================================================
const activeTab = ref<'statement' | 'submit' | 'solutions' | 'discussions'>('statement')
const contestId = computed(() => { const m = (currentUrl.value || window.location.href).match(/[?&]contestId=(\d+)/); return m ? m[1] : '' })
const inContestMode = computed(() => !!contestId.value)
const ideMode = ref(inContestMode.value || window.location.hash === '#ide')
const isSplitView = computed(() => ideMode.value || inContestMode.value)

// Resizable split
const splitRatio = ref(40)
const isDragging = ref(false)
let cleanupResize: (() => void) | null = null
function startResize(e: MouseEvent) {
  isDragging.value = true
  const container = (e.target as HTMLElement).parentElement!
  const startPct = splitRatio.value
  const startX = e.clientX
  const totalW = container.offsetWidth
  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX
    splitRatio.value = Math.max(25, Math.min(65, startPct + (dx / totalW) * 100))
  }
  const onUp = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    cleanupResize = null
  }
  cleanupResize = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// Test samples for IDE mode
const testInput = ref('')
const testExpectedOutput = ref('')
const testActualOutput = ref('')
const testRunning = ref(false)
const testVerdict = ref('')
const showTestPanel = ref(true)

const isLoggedIn = computed(() => checkLuoguLogin())

// Copy to clipboard (Shadow DOM compatible)
function copyText(text: string) {
  const el = document.createElement('textarea')
  el.value = text
  el.style.cssText = 'position:fixed;left:-9999px;top:0'
  document.body.appendChild(el)
  el.focus()
  el.select()
  try {
    document.execCommand('copy')
  }
  catch {}
  document.body.removeChild(el)
}

let activeWs: WebSocket | null = null
let activeWsTimeout: ReturnType<typeof setTimeout> | null = null

function cleanupWs() {
  if (activeWsTimeout) { clearTimeout(activeWsTimeout); activeWsTimeout = null }
  if (activeWs) {
    try { activeWs.close() }
    catch {}; activeWs = null
  }
}

async function _runTest() {
  if (!codeContent.value.trim()) { testVerdict.value = '无代码'; return }
  if (!isLoggedIn.value) { testVerdict.value = '请先登录'; return }
  if (testRunning.value)
    return
  testRunning.value = true; testVerdict.value = ''; testActualOutput.value = '编译运行中…'
  cleanupWs()
  const csrf = (window as any).__guly_user?.csrfToken || ''
  let resolved = false
  activeWs = new WebSocket('wss://ws.luogu.com.cn/ws')
  const ws = activeWs
  activeWsTimeout = setTimeout(() => { if (!resolved) { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '超时'; testActualOutput.value = '评测超时，请重试' } }, 25000)
  ws.onopen = () => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', 'https://www.luogu.com.cn/api/ide_submit')
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
    xhr.setRequestHeader('X-CSRF-TOKEN', csrf)
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
    xhr.withCredentials = true
    xhr.onload = () => {
      if (resolved)
        return
      try {
        const j = JSON.parse(xhr.responseText)
        const rid = String(j?.data?.rid ?? '')
        if (rid) { ws.send(JSON.stringify({ type: 'join_channel', channel: 'ide.track', channel_param: rid })) }
        else { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '失败'; testActualOutput.value = j?.errorMessage || 'IDE 提交失败' }
      }
      catch { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '失败'; testActualOutput.value = 'IDE 返回异常' }
    }
    xhr.onerror = () => { if (!resolved) { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '失败'; testActualOutput.value = '请求失败，请检查网络连接或洛谷状态' } }
    const body = new URLSearchParams({ lang: String(selectedLang.value.id), code: codeContent.value, input: testInput.value, o2: enableO2.value ? '1' : '0', 'csrf-token': csrf })
    xhr.send(body.toString())
  }
  ws.onmessage = (event) => {
    if (resolved)
      return
    try {
      const msg = JSON.parse(event.data)
      if (msg._ws_type === 'server_broadcast' && msg.type === 'execute') {
        resolved = true; cleanupWs(); testRunning.value = false
        const exec = msg.execute || {}
        if (exec.error) { testVerdict.value = 'RE'; testActualOutput.value = exec.error }
        else if (exec.exit_code != null) {
          if (exec.exit_code !== 0) { testVerdict.value = `RE (exit ${exec.exit_code})`; testActualOutput.value = msg.output ?? '(no output)' }
          else {
            const out = msg.output ?? ''
            testActualOutput.value = out || '(no output)'
            const exp = testExpectedOutput.value.trim()
            testVerdict.value = exp ? (out.trim() === exp ? 'AC' : 'WA') : `运行完成 (${exec.cpu_time ?? 0}ms, ${exec.memory ?? 0}KB)`
          }
        }
      }
    }
    catch {}
  }
  ws.onerror = () => { if (!resolved) { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '错误'; testActualOutput.value = 'WebSocket 连接失败' } }
  ws.onclose = () => { if (!resolved) { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '错误'; testActualOutput.value = 'WebSocket 连接关闭' } }
}
const contestProblems = ref<Array<{ no: string, pid: string, title: string, score: number }>>([])
const showProblemSwitcher = ref(false)

async function fetchContestProblems() {
  if (!contestId.value)
    return
  try {
    const res = await fetch(`https://www.luogu.com.cn/contest/${contestId.value}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const cd = ctx?.data || ctx?.currentData || {}
      const all = cd?.contestProblems || []
      contestProblems.value = all.map((p: any) => ({
        no: p.no || '',
        pid: p.problem?.pid || p.pid || '',
        title: p.problem?.name || p.title || '',
        score: p.score || 0,
      }))
    }
  }
  catch {}
}

function switchToProblem(pid: string) {
  if (pid)
    navigateTo(AppPage.ProblemDetail, `https://www.luogu.com.cn/problem/${pid}?contestId=${contestId.value}`)
}

// Initial load + SPA navigation: re-fetch when contestId changes
if (inContestMode.value)
  fetchContestProblems()
watch(contestId, (newId) => {
  if (newId)
    fetchContestProblems()
})
const submitting = ref(false)
const submitError = ref('')
const copiedMarkdown = ref(false)
const copiedSample = ref<string | null>(null)
const submitResult = ref('')
const lastRid = ref<number | null>(null)
const submitHistory = ref<Array<{ rid: number, pid: string, time: number }>>([])
const captchaSrc = ref('')
const captchaCode = ref('')
function loadCaptcha() {
  captchaCode.value = ''
  captchaSrc.value = `https://www.luogu.com.cn/api/verify/captcha?_t=${Date.now()}`
}

// Default code templates per language
function getDefaultCode(lang: number): string {
  const t: Record<number, string> = {
    1: 'program APlusB;\nvar a, b: longint;\nbegin\n    readln(a, b);\n    writeln(a + b);\nend.\n',
    2: '#include <stdio.h>\n\nint main() {\n    int a, b;\n    scanf("%d%d", &a, &b);\n    printf("%d\\n", a + b);\n    return 0;\n}\n',
    3: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
    4: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
    5: '',
    7: 's = input().split()\nprint(int(s[0]) + int(s[1]))\n',
    8: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner cin = new Scanner(System.in);\n        int a = cin.nextInt(), b = cin.nextInt();\n        System.out.println(a + b);\n    }\n}\n',
    9: 'const fs = require("fs");\nconst data = fs.readFileSync("/dev/stdin");\nconst result = data.toString("ascii").trim().split(" ").map(x => parseInt(x)).reduce((a, b) => a + b, 0);\nconsole.log(result);\nprocess.exit();\n',
    10: 'a = io.read("*n")\nb = io.read("*n")\nprint(a + b)\n',
    11: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
    12: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
    13: 'Scanf.scanf "%i %i\\n" (fun a b -> print_int (a + b))\n',
    14: 'package main\n\nimport "fmt"\n\nfunc main() {\n    var a, b int\n    fmt.Scanf("%d%d", &a, &b)\n    fmt.Println(a + b)\n}\n',
    15: 'use std::io;\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_line(&mut input).unwrap();\n    let mut s = input.trim().split(" ");\n    let a: i32 = s.next().unwrap().parse().unwrap();\n    let b: i32 = s.next().unwrap().parse().unwrap();\n    println!("{}", a + b);\n}\n',
    16: '<?php\n$input = trim(file_get_contents("php://stdin"));\nlist($a, $b) = explode(" ", $input);\necho $a + $b;\n',
    17: 'using System;\n\npublic class APlusB {\n    private static void Main() {\n        string[] input = Console.ReadLine().Split(" ");\n        Console.WriteLine(int.Parse(input[0]) + int.Parse(input[1]));\n    }\n}\n',
    18: 'a, b = gets.split.map(&:to_i)\nprint a + b\n',
    19: 'main = do\n    [a, b] <- (map read . words) \x60fmap\x60 getLine\n    print (a + b)\n',
    20: 'fun main(args: Array<String>) {\n    val (a, b) = readLine()!!.split(" ").map(String::toInt)\n    println(a + b)\n}\n',
    21: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner cin = new Scanner(System.in);\n        int a = cin.nextInt(), b = cin.nextInt();\n        System.out.println(a + b);\n    }\n}\n',
    22: 'import java.util.Scanner\n\nobject Main {\n    def main(args: Array[String]): Unit = {\n        val cin = new Scanner(System.in)\n        val a = cin.nextInt()\n        val b = cin.nextInt()\n        println(a + b)\n    }\n}\n',
    23: 'nums = map(x -> parse(Int, x), split(readline(), " "))\nprintln(nums[1] + nums[2])\n',
    24: 's = raw_input().split()\nprint int(s[0]) + int(s[1])\n',
    25: 's = input().split()\nprint(int(s[0]) + int(s[1]))\n',
    26: 'my \\$in = <STDIN>;\nchomp \\$in;\n\\$in = [split /[\\\\s,]+/, \\$in];\nmy \\$c = \\$in->[0] + \\$in->[1];\nprint "\\$c\\\\n";\n',
    27: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
    28: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
    29: 'open System\n\n[<EntryPoint>]\nlet main argv =\n    let input = Console.ReadLine().Split(" ")\n    let a = int input.[0]\n    let b = int input.[1]\n    printfn "%d" (a + b)\n    0\n',
    31: 'import std.stdio;\n\nvoid main() {\n    int a, b;\n    readf("%d %d", &a, &b);\n    writeln(a + b);\n}\n',
    34: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
  }
  return t[lang] || ''
}
function onLangChange(lang: LuoguLanguage) {
  selectedLang.value = lang
  if (!codeContent.value) {
    codeContent.value = getDefaultCode(lang.id)
  }
}

if (!codeContent.value)
  codeContent.value = getDefaultCode(28)

// ============================================================
// Computed
// ============================================================
const tabs = computed(() => {
  const base = [
    { key: 'statement' as const, label: '题目描述', icon: 'mingcute:document-line' },
    { key: 'submit' as const, label: '提交代码', icon: 'mingcute:code-line' },
  ]
  if (inContestMode.value) {
    base.push({ key: 'switchProblem' as any, label: '切换题目', icon: 'mingcute:transfer-line' })
  }
  else {
    base.push(
      { key: 'solutions' as const, label: '题解', icon: 'mingcute:bulb-line' },
      { key: 'discussions' as const, label: '讨论', icon: 'mingcute:comment-line' },
    )
  }
  return base
})

const difficultyColor = computed(() => difficultyMap[problem.value.difficulty]?.color || '#909399')

const passRate = computed(() => {
  if (problem.value.totalSubmit === 0)
    return 0
  return Math.round((problem.value.totalAccepted / problem.value.totalSubmit) * 100)
})

const renderedDescription = computed(() => {
  const parts: string[] = []
  if (problem.value.background)
    parts.push(problem.value.background)
  parts.push(problem.value.description)
  if (problem.value.inputFormat)
    parts.push(`## 输入格式\n\n${problem.value.inputFormat}`)
  if (problem.value.outputFormat)
    parts.push(`## 输出格式\n\n${problem.value.outputFormat}`)
  return parseProblemMarkdown(parts.join('\n\n'))
})

const renderedHint = computed(() => parseProblemMarkdown(problem.value.hint))

// ============================================================
// Actions
// ============================================================
async function handleSubmit() {
  if (!codeContent.value.trim()) { submitError.value = '请输入代码'; return }
  if (!isLoggedIn.value) { submitError.value = '请先登录洛谷'; return }

  submitting.value = true
  submitError.value = ''
  submitResult.value = ''

  const result = await submitCode({
    pid: problemId.value,
    contestId: inContestMode.value ? contestId.value : undefined,
    code: codeContent.value,
    lang: selectedLang.value.id,
    enableO2: enableO2.value && selectedLang.value.canO2,
    captcha: captchaCode.value || undefined,
  })

  submitting.value = false

  // --- Success ---
  if (result.status === 200 && result.rid) {
    captchaSrc.value = ''; captchaCode.value = ''
    lastRid.value = result.rid
    submitResult.value = `提交成功！评测记录 #${result.rid}`
    submitHistory.value.unshift({ rid: result.rid, pid: problemId.value, time: Date.now() })
    if (submitHistory.value.length > 5)
      submitHistory.value.pop()
    window.open(`https://www.luogu.com.cn/record/${result.rid}`, '_blank')
    return
  }

  // --- Captcha needed ---
  if (result.needCaptcha) {
    submitResult.value = ''
    submitError.value = '需要输入验证码才能提交'
    loadCaptcha()
    return
  }

  // --- Cloudflare / network errors ---
  if (result.status === 503 || result.status === 0) {
    submitError.value = result.errorMessage || '网络异常，请检查洛谷是否可访问'
    return
  }

  // --- Auth / permission errors ---
  if (result.status === 403) {
    submitError.value = result.errorMessage || '请先登录洛谷'
    return
  }

  // --- Unknown error ---
  submitError.value = result.errorMessage || `提交失败 (${result.status})`
}
function copyWithFeedback(key: string, text: string) {
  copyText(text)
  copiedSample.value = key
  setTimeout(() => {
    if (copiedSample.value === key)
      copiedSample.value = null
  }, 1500)
}

function buildProblemMarkdown(): string {
  const p = problem.value
  const lines: string[] = []
  lines.push(`# ${p.pid} ${p.title}\n`)
  if (p.background)
    lines.push(`${p.background}\n`)
  lines.push(p.description)
  if (p.inputFormat)
    lines.push(`## 输入格式\n\n${p.inputFormat}`)
  if (p.outputFormat)
    lines.push(`## 输出格式\n\n${p.outputFormat}`)
  if (p.samples.length > 0) {
    lines.push('## 样例\n')
    p.samples.forEach((s, i) => {
      lines.push(`### 样例 ${i + 1}\n`)
      lines.push('```input')
      lines.push(s.input)
      lines.push('```\n')
      lines.push('```output')
      lines.push(s.output)
      lines.push('```\n')
      if (s.explanation)
        lines.push(`${s.explanation}\n`)
    })
  }
  if (p.hint)
    lines.push(`## 提示\n\n${p.hint}`)
  if (p.source)
    lines.push(`\n来源：${p.source}`)
  return lines.join('\n\n')
}

async function copyMarkdown() {
  copyText(buildProblemMarkdown())
  copiedMarkdown.value = true
  setTimeout(() => {
    copiedMarkdown.value = false
  }, 2000)
}
function openLuoguIDE() {
  // Open Luogu's own IDE for code submission (handles Cloudflare/captcha natively)
  window.open(`https://www.luogu.com.cn/problem/${problemId.value}#submit`, '_blank')
}

function _openOriginalPage() {
  window.open(`https://www.luogu.com.cn/problem/${problemId.value}`, '_blank')
}

// 外站题目(CF/AT/NC/SP/UVA)→ 原站跳转;洛谷自建题(P/B/T/…)返回 null
function externalProblemUrl(pid: string): string | null {
  if (!pid)
    return null
  // Codeforces CF{contest}{index}:CF1A / CF1011D
  let m = pid.match(/^CF(\d+)([A-Z]\d*)$/)
  if (m)
    return `https://codeforces.com/problemset/problem/${m[1]}/${m[2]}`
  // AtCoder AT_{contest}_{task}:AT_abc188_d
  m = pid.match(/^AT_(.+)$/)
  if (m) {
    const contest = m[1].split('_')[0]
    return `https://atcoder.jp/contests/${contest}/tasks/${m[1]}`
  }
  // NowCoder NC{id}:NC12345
  m = pid.match(/^NC(\d+)$/)
  if (m)
    return `https://ac.nowcoder.com/acm/problem/${m[1]}`
  // SPOJ SP[_]?{code}
  m = pid.match(/^SP_?(.+)$/)
  if (m)
    return `https://www.spoj.com/problems/${m[1].toUpperCase()}/`
  // UVa UVA[_]?{id}:跳到官方 PDF 题面
  m = pid.match(/^UVA_?(\d+)$/)
  if (m)
    return `https://onlinejudge.org/external/${m[1].slice(0, 3)}/${m[1]}.pdf`
  return null
}
const externalUrl = computed(() => externalProblemUrl(problemId.value))
function openOriginalSite() {
  if (externalUrl.value)
    window.open(externalUrl.value, '_blank')
}

function openSolutionsPage() {
  navigateTo(AppPage.Solution, `https://www.luogu.com.cn/problem/solution/${problemId.value}`)
}
function openProviderProfile(uid: number) {
  window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank')
}

function handleTabChange(tab: string) {
  if (tab === 'switchProblem') {
    showProblemSwitcher.value = !showProblemSwitcher.value
    return
  }
  activeTab.value = tab as typeof activeTab.value
  submitError.value = ''
  if (tab === 'solutions' && solutions.value.length === 0)
    loadSolutions()
}

// ============================================================
// Lifecycle
// ============================================================
onMounted(() => {
  loadRealData()
  injectKatexCSS()
})

// Reload data on SPA navigation to a different problem
watch(problemId, (newPid, oldPid) => {
  if (newPid !== oldPid) {
    loadError.value = false
    loading.value = true
    submitError.value = ''
    submitResult.value = ''
    captchaSrc.value = ''
    captchaCode.value = ''
    testVerdict.value = ''
    testActualOutput.value = ''
    submitHistory.value = []
    cleanupWs()
    loadRealData()
  }
})

onUnmounted(() => {
  if (loadingTimer)
    clearTimeout(loadingTimer)
  cleanupResize?.()
  cleanupWs()
})
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <Loading v-if="loading" />
    <div
      v-if="!loading && loadError" bg="$bew-content" rounded="$bew-radius" p-8 text="center"
      border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1);color:var(--bew-error-color)" flex="~ col" items="center" gap-2
      mt-4
    >
      <span style="display:contents" v-html="renderIcon('mingcute:warning-line', 32)" />
      <p fw-bold>
        题目数据加载失败
      </p>
      <p text="sm" style="color:var(--bew-text-3)">
        请确认已登录洛谷并刷新页面重试
      </p>
    </div>

    <Transition name="content-reveal">
      <div v-if="!loading" w-full>
        <!-- ============================================================ -->
        <!-- Problem Header -->
        <!-- ============================================================ -->
        <div
          v-show="!isSplitView"
          bg="$bew-content" rounded="$bew-radius" p-6 mb-4
          shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
          border="1 $bew-border-color"
          style="backdrop-filter: var(--bew-filter-glass-1)"
        >
          <div flex="~ col md:row gap-4" items="start md:items-center" justify="between">
            <div flex="~ col gap-2" flex-1 min-w-0>
              <div flex="~ items-center gap-3" flex-wrap>
                <h1 text="2xl $bew-text-1" fw-bold>
                  <span text="$bew-text-3" font-mono>{{ problem.pid }}</span>
                  {{ problem.title }}
                </h1>
                <span
                  text="xs" fw-bold shrink-0
                  p="x-2 y-0.5"
                  rounded="$bew-radius-half"
                  flex="~ items-center gap-1"
                  :style="{ backgroundColor: `${difficultyColor}20`, color: difficultyColor }"
                >
                  <span style="display:contents" v-html="renderIcon('mingcute:fire-line', 12)" />
                  {{ problem.difficultyLabel }}
                </span>
                <button
                  v-if="externalUrl"
                  text="xs"
                  flex="~ items-center gap-1"
                  shrink-0
                  style="background:none;border:1px solid var(--bew-border-color);border-radius:var(--bew-radius-half);padding:2px 8px;cursor:pointer;color:var(--bew-text-2);white-space:nowrap"
                  :title="`在原站打开 (${problemId})`"
                  @click="openOriginalSite"
                >
                  <span style="display:contents" v-html="renderIcon('mingcute:link-2-line', 14)" />
                  原站
                </button>
              </div>

              <!-- Tags -->
              <div v-if="problem.tags.length > 0" flex="~ gap-1.5 wrap" mt-1>
                <span
                  v-for="tag in problem.tags" :key="tag.id" text="xs" px-2 py-0.5
                  rounded-full bg="$bew-fill-2" flex="~ items-center gap-1" style="color:var(--bew-text-3)"
                ><span style="display:contents" v-html="renderIcon('mingcute:hashtag-line', 10)" />{{ tag.name }}</span>
              </div>

              <div flex="~ gap-4 wrap" text="sm $bew-text-2">
                <span flex="~ items-center gap-1">
                  <span style="display:contents" v-html="renderIcon('mingcute:time-line', 16)" />
                  <span>{{ problem.timeLimit }}</span>
                </span>
                <span flex="~ items-center gap-1">
                  <span style="display:contents" v-html="renderIcon('mingcute:chip-line', 16)" />
                  <span>{{ problem.memoryLimit }}</span>
                </span>
                <span flex="~ items-center gap-1">
                  <span style="display:contents" v-html="renderIcon('mingcute:chart-bar-line', 16)" />
                  <span>通过 {{ problem.totalAccepted.toLocaleString() }} / {{ problem.totalSubmit.toLocaleString() }} ({{ passRate }}%)</span>
                </span>
              </div>

              <div v-if="problem.provider" flex="~ items-center gap-2" mt-1>
                <span text="xs $bew-text-3">提供者：</span>
                <span
                  text="sm $bew-theme-color" fw-bold cursor-pointer
                  @click="openProviderProfile(problem.provider!.uid)"
                >{{ problem.provider.name }}</span>
              </div>
            </div>

            <div flex="~ gap-2" shrink-0>
              <Button
                :type="copiedMarkdown ? 'success' : 'secondary'"
                @click="copyMarkdown"
              >
                <span style="display:contents" v-html="renderIcon(copiedMarkdown ? 'mingcute:check-circle-fill' : 'mingcute:copy-line', 16)" />
                {{ copiedMarkdown ? '已复制' : '复制 Markdown' }}
              </Button>
              <Button type="primary" @click="handleTabChange('submit')">
                <span style="display:contents" v-html="renderIcon('mingcute:code-line', 16)" />
                提交代码
              </Button>
            </div>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- Tab Bar -->
        <!-- ============================================================ -->
        <div
          v-show="!isSplitView"
          flex="~ gap-1" mb-4 p-1
          bg="$bew-content" rounded="$bew-radius"
          border="1 $bew-border-color"
          style="backdrop-filter: var(--bew-filter-glass-1)"
        >
          <button
            v-for="tab in tabs"
            :key="tab.key"
            flex="~ items-center gap-1.5"
            p="x-4 y-2"
            rounded="$bew-radius-half"
            text="sm"
            border="none"
            cursor="pointer"
            :class="activeTab === tab.key
              ? 'bg-$bew-theme-color text-white'
              : 'text-$bew-text-2 hover:bg-$bew-fill-2 hover:text-$bew-text-1'"
            @click="handleTabChange(tab.key)"
          >
            <span style="display:contents" v-html="renderIcon(tab.icon, 16)" />
            {{ tab.label }}
          </button>
          <button
            v-if="!isSplitView" flex="~ items-center gap-1" p="x-3 y-2" rounded="$bew-radius-half" text="sm"
            border="none" cursor="pointer" style="background:var(--bew-success-color-20);color:var(--bew-success-color);font-weight:600;margin-left:auto" @click="ideMode = true"
          >
            <span style="display:contents" v-html="renderIcon('mingcute:terminal-line', 16)" />
            IDE
          </button>
        </div>

        <!-- Contest Problem Switcher -->
        <div
          v-if="showProblemSwitcher" bg="$bew-content" rounded="$bew-radius" p-3 mb-4
          border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)"
        >
          <div flex="~ items-center justify-between" mb-2>
            <span style="font-weight:600;color:var(--bew-text-1);font-size:var(--bew-base-font-size)">切换题目</span>
            <button bg="transparent" border="none" cursor="pointer" style="color:var(--bew-text-3);font-size:1.2em" @click="showProblemSwitcher = false">
              &times;
            </button>
          </div>
          <div grid="~ cols-5" gap-2>
            <button
              v-for="cp in contestProblems" :key="cp.no"
              :style="{
                background: cp.pid === problemId ? 'var(--bew-theme-color)' : 'var(--bew-fill-1)',
                color: cp.pid === problemId ? '#fff' : 'var(--bew-text-1)',
                border: `1px solid ${cp.pid === problemId ? 'var(--bew-theme-color)' : 'var(--bew-border-color)'}`,
                borderRadius: 'var(--bew-radius)',
                padding: '8px 14px',
                cursor: 'pointer',
                fontWeight: cp.pid === problemId ? 700 : 500,
                fontSize: 'var(--bew-base-font-size)',
                textAlign: 'left',
              }"
              @click="switchToProblem(cp.pid)"
            >
              <div>{{ cp.no }}. {{ cp.pid }}</div>
              <div style="font-size:.75em;opacity:.8">
                {{ cp.title }}
              </div>
              <div style="font-size:.7em;opacity:.6">
                {{ cp.score }}分
              </div>
            </button>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- Split View (IDE / Contest mode) -->
        <!-- ============================================================ -->
        <div v-if="isSplitView" flex style="height:calc(100vh - 90px);margin:0 -16px 0 -16px;gap:0">
          <!-- Left: Header + Problem Statement -->
          <div
            :style="{ flex: `0 0 ${splitRatio}%`, backdropFilter: 'var(--bew-filter-glass-1)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '8px' }" bg="$bew-content" rounded="$bew-radius" p-6 border="1 $bew-border-color"
            shadow="[var(--bew-shadow-1)]"
          >
            <!-- Problem header info -->
            <h1 style="font-size:1.2rem;font-weight:700;color:var(--bew-text-1)">
              <span text="$bew-text-3" font-mono>{{ problem.pid }}</span> {{ problem.title }}
            </h1>
            <div flex="~ gap-2 wrap" style="font-size:.8em;color:var(--bew-text-2)">
              <span v-if="problem.difficultyLabel" flex="~ items-center gap-1" px-2 py-0.5 rounded-full :style="{ backgroundColor: `${difficultyColor}20`, color: difficultyColor }"><span style="display:contents" v-html="renderIcon('mingcute:fire-line', 12)" /> {{ problem.difficultyLabel }}</span>
              <span>{{ problem.timeLimit }}</span>
              <span>{{ problem.memoryLimit }}</span>
            </div>
            <!-- Statement -->
            <div class="problem-statement" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);line-height:1.8">
              <div mb-4 v-html="renderedDescription" />
              <div v-if="problem.samples.length > 0" mt-6>
                <h3 mb-3>
                  样例
                </h3>
                <div v-for="(sample, idx) in problem.samples" :key="idx" mb-3>
                  <div bg="$bew-fill-1" rounded="$bew-radius" p-3 mb-2>
                    <div flex="~ items-center justify-between" mb-1>
                      <span text="xs $bew-text-3">输入 #{{ idx + 1 }}</span>
                      <button class="sample-copy-btn" :class="{ copied: copiedSample === `in-${idx}` }" @click="copyWithFeedback(`in-${idx}`, String(Array.isArray(sample) ? sample[0] : sample.input))">
                        <span v-if="copiedSample === `in-${idx}`" style="display:contents" v-html="renderIcon('mingcute:check-circle-fill', 12)" />
                        <span v-else style="display:contents" v-html="renderIcon('mingcute:copy-line', 12)" />
                        {{ copiedSample === `in-${idx}` ? '已复制' : '复制' }}
                      </button>
                    </div>
                    <pre style="margin:0;white-space:pre-wrap;font-size:.85em;color:var(--bew-text-1);font-family:Consolas,monospace">{{ Array.isArray(sample) ? sample[0] : sample.input }}</pre>
                  </div>
                  <div bg="$bew-fill-1" rounded="$bew-radius" p-3>
                    <div flex="~ items-center justify-between" mb-1>
                      <span text="xs $bew-text-3">输出 #{{ idx + 1 }}</span>
                      <button class="sample-copy-btn" :class="{ copied: copiedSample === `out-${idx}` }" @click="copyWithFeedback(`out-${idx}`, String(Array.isArray(sample) ? sample[1] : sample.output))">
                        <span v-if="copiedSample === `out-${idx}`" style="display:contents" v-html="renderIcon('mingcute:check-circle-fill', 12)" />
                        <span v-else style="display:contents" v-html="renderIcon('mingcute:copy-line', 12)" />
                        {{ copiedSample === `out-${idx}` ? '已复制' : '复制' }}
                      </button>
                    </div>
                    <pre style="margin:0;white-space:pre-wrap;font-size:.85em;color:var(--bew-text-1);font-family:Consolas,monospace">{{ Array.isArray(sample) ? sample[1] : sample.output }}</pre>
                  </div>
                  <div v-if="(Array.isArray(sample) ? sample[2] : sample.explanation)" mt-1 text="xs" style="color:var(--bew-text-3)">
                    说明: {{ Array.isArray(sample) ? sample[2] : sample.explanation }}
                  </div>
                </div>
              </div>
              <div v-if="problem.hint" class="markdown-body" mt-4 v-html="renderedHint" />
            </div>
            <div style="margin-top:auto;padding-top:12px;border-top:1px solid var(--bew-border-color);display:flex;align-items:center;gap:4px;color:var(--bew-text-4);font-size:.75em">
              <span style="display:contents" v-html="renderIcon('mingcute:check-line', 12)" />
              题目正文结束
            </div>
          </div>

          <!-- Resize Handle -->
          <div :style="{ flex: '0 0 3px', cursor: 'col-resize', background: isDragging ? 'var(--bew-theme-color)' : 'transparent', transition: isDragging ? 'none' : 'background .15s', userSelect: 'none', margin: '0 1px', position: 'relative' }" class="resize-handle" @mousedown="startResize">
            <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--bew-text-4);pointer-events:none;line-height:0" v-html="renderIcon('mingcute:transfer-line', 10)" />
          </div>

          <!-- Right: Code Editor + Controls -->
          <div :style="{ flex: `0 0 ${100 - splitRatio - 0.5}%`, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }">
            <!-- Editor Card -->
            <div bg="$bew-content" rounded="$bew-radius" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1);display:flex;flex-direction:column;flex:1;min-height:0">
              <!-- Top bar: all controls -->
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;padding:5px 10px;border-bottom:1px solid var(--bew-border-color);font-size:.82em;overflow-x:auto">
                <div v-if="contestProblems.length > 0" style="display:flex;align-items:center;gap:3px">
                  <span v-for="cp in contestProblems" :key="cp.no" style="padding:0 6px;border-radius:999px;cursor:pointer;font-size:.72em;font-weight:600;white-space:nowrap" :style="{ background: cp.pid === problemId ? 'var(--bew-theme-color)' : 'var(--bew-fill-2)', color: cp.pid === problemId ? '#fff' : 'var(--bew-text-2)' }" @click="switchToProblem(cp.pid)">{{ cp.no }}</span>
                </div>
                <select :value="selectedLang.id" style="padding:2px 4px;background:var(--bew-fill-1);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:var(--bew-radius-half);font-size:.85em;outline:none" @change="(e: Event) => { const lang = LUOGU_LANGUAGES.find(l => l.id === Number((e.target as HTMLSelectElement).value)); if (lang) onLangChange(lang) }">
                  <option v-for="l in LUOGU_LANGUAGES" :key="l.id" :value="l.id">
                    {{ l.name }}
                  </option>
                </select>
                <label v-if="selectedLang.canO2" style="display:flex;align-items:center;gap:3px;color:var(--bew-text-2);cursor:pointer;white-space:nowrap;font-size:.85em">
                  <input v-model="enableO2" type="checkbox" style="width:13px;height:13px;cursor:pointer"> O2
                </label>
                <span style="flex:1" />
                <button style="display:flex;align-items:center;gap:4px;background:none;border:1px solid var(--bew-border-color);border-radius:var(--bew-radius-half);padding:2px 8px;cursor:pointer;color:var(--bew-text-2);font-size:.82em;white-space:nowrap" @click="showTestPanel = !showTestPanel">
                  <span style="display:contents" v-html="renderIcon(showTestPanel ? 'mingcute:down-line' : 'mingcute:right-line', 12)" />
                  自测
                </button>
                <button v-if="!inContestMode" style="display:flex;align-items:center;gap:4px;background:none;border:1px solid var(--bew-border-color);border-radius:var(--bew-radius-half);padding:2px 8px;cursor:pointer;color:var(--bew-text-2);font-size:.82em;white-space:nowrap" @click="ideMode = false">
                  <span style="display:contents" v-html="renderIcon('mingcute:exit-line', 12)" />
                  退出
                </button>
                <button v-else style="display:flex;align-items:center;gap:4px;background:none;border:1px solid var(--bew-border-color);border-radius:var(--bew-radius-half);padding:2px 8px;cursor:pointer;color:var(--bew-text-2);font-size:.82em;white-space:nowrap" @click="navigateTo(AppPage.ContestDetail, `https://www.luogu.com.cn/contest/${contestId}`)">
                  <span style="display:contents" v-html="renderIcon('mingcute:arrow-left-line', 12)" />
                  返回比赛
                </button>
                <button :disabled="submitting" style="display:flex;align-items:center;gap:4px;background:var(--bew-theme-color);color:#fff;border:none;border-radius:var(--bew-radius-half);padding:3px 12px;cursor:pointer;font-size:.85em;font-weight:600;white-space:nowrap" @click="handleSubmit">
                  <span style="display:contents" v-html="renderIcon('mingcute:send-line', 12)" />
                  {{ submitting ? '…' : '提交' }}
                </button>
              </div>
              <div style="flex:1;position:relative;overflow:hidden">
                <div ref="cmHost" style="position:absolute;inset:0;overflow:hidden" />
              </div>
            </div>

            <!-- Submit feedback (IDE/contest split view — was missing: result/captcha/error) -->
            <div v-if="submitResult || submitError || captchaSrc" style="flex-shrink:0;display:flex;flex-direction:column;gap:6px;margin-top:6px;padding:8px 10px;background:var(--bew-content);border:1px solid var(--bew-border-color);border-radius:var(--bew-radius);font-size:.82em">
              <div v-if="submitResult" style="color:var(--bew-success-color);font-weight:600">
                {{ submitResult }}
              </div>
              <div v-if="captchaSrc" style="display:flex;flex-direction:column;gap:6px">
                <img :src="captchaSrc" style="max-width:180px;border-radius:4px" alt="验证码">
                <div style="display:flex;align-items:center;gap:6px">
                  <input v-model="captchaCode" placeholder="输入验证码" style="flex:1;padding:5px 8px;background:var(--bew-fill-1);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:var(--bew-radius-half);font-size:.85em;outline:none" @keydown.enter="handleSubmit">
                  <button :disabled="!captchaCode" style="background:var(--bew-theme-color);color:#fff;border:none;border-radius:var(--bew-radius-half);padding:5px 10px;cursor:pointer;font-weight:600;white-space:nowrap" @click="handleSubmit">
                    提交
                  </button>
                </div>
                <button style="background:none;border:none;color:var(--bew-text-3);cursor:pointer;font-size:.75em;align-self:flex-start" @click="captchaSrc = ''; captchaCode = ''; submitError = ''">
                  取消
                </button>
              </div>
              <div v-if="submitError" style="display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--bew-error-color)">
                <span>{{ submitError }}</span>
                <button v-if="submitError.includes('验证码')" style="background:var(--bew-theme-color);color:#fff;border:none;border-radius:var(--bew-radius-half);padding:3px 8px;cursor:pointer;font-size:.82em;font-weight:600;white-space:nowrap;flex-shrink:0" @click="loadCaptcha()">
                  刷新验证码
                </button>
              </div>
            </div>

            <!-- Test Panels -->
            <div v-if="showTestPanel" style="flex-shrink:0;display:flex;gap:6px;min-height:120px">
              <div bg="$bew-content" rounded="$bew-radius" style="backdrop-filter:var(--bew-filter-glass-1);display:flex;flex-direction:column;flex:1;overflow:hidden;border:1px solid var(--bew-border-color)">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px 2px;font-size:.75em;color:var(--bew-text-3);border-bottom:1px solid var(--bew-border-color)">
                  <span>自测输入</span>
                  <span flex="~ items-center gap-1">
                    <span v-if="testVerdict" style="padding:0 6px;border-radius:999px;font-size:.75em;font-weight:700;line-height:1.5" :style="{ background: testVerdict.startsWith('AC') || testVerdict.startsWith('运行完成') ? 'var(--bew-success-color-20)' : 'var(--bew-error-color-20)', color: testVerdict.startsWith('AC') || testVerdict.startsWith('运行完成') ? 'var(--bew-success-color)' : 'var(--bew-error-color)' }">{{ testVerdict }}</span>
                    <button :disabled="testRunning" style="display:flex;align-items:center;gap:4px;background:var(--bew-theme-color);color:#fff;border:none;border-radius:var(--bew-radius-half);padding:2px 8px;cursor:pointer;font-size:.82em;font-weight:600;white-space:nowrap" @click="_runTest">
                      <span style="display:contents" v-html="renderIcon('mingcute:play-fill', 12)" />
                      {{ testRunning ? '…' : '运行测试' }}
                    </button>
                  </span>
                </div>
                <textarea v-model="testInput" style="flex:1;width:100%;background:var(--bew-fill-1);color:var(--bew-text-1);border:none;padding:8px 10px;font-family:Consolas,monospace;font-size:.78em;resize:none;outline:none" placeholder="输入…" />
              </div>
              <div bg="$bew-content" rounded="$bew-radius" style="backdrop-filter:var(--bew-filter-glass-1);display:flex;flex-direction:column;flex:1;overflow:hidden;border:1px solid var(--bew-border-color)">
                <div style="flex:1;display:flex;flex-direction:column;border-bottom:1px solid var(--bew-border-color)">
                  <div style="padding:6px 10px 2px;font-size:.75em;color:var(--bew-text-3)">
                    预期输出
                  </div>
                  <textarea v-model="testExpectedOutput" style="flex:1;width:100%;background:var(--bew-fill-1);color:var(--bew-text-1);border:none;padding:8px 10px;font-family:Consolas,monospace;font-size:.78em;resize:none;outline:none" placeholder="手动填入" />
                </div>
                <div style="flex:1;display:flex;flex-direction:column">
                  <div style="padding:6px 10px 2px;font-size:.75em;color:var(--bew-text-3)">
                    自测输出
                  </div>
                  <textarea v-model="testActualOutput" style="flex:1;width:100%;background:var(--bew-fill-1);color:var(--bew-text-1);border:none;padding:8px 10px;font-family:Consolas,monospace;font-size:.78em;resize:none;outline:none" placeholder="—" readonly />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- Statement Tab -->
        <!-- ============================================================ -->
        <Transition v-if="!isSplitView" name="page-fade" mode="out-in">
          <div
            v-if="activeTab === 'statement'"
            key="statement"
            bg="$bew-content" rounded="$bew-radius" p="6 md:p-8"
            shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
            border="1 $bew-border-color"
            style="backdrop-filter: var(--bew-filter-glass-1)"
          >
            <div class="problem-statement">
              <!-- Main description (includes background, description, I/O format) -->
              <div mb-6 v-html="renderedDescription" />

              <!-- Sample I/O -->
              <div v-if="problem.samples.length > 0" mt-8>
                <h2 mb-4 flex="~ items-center gap-2">
                  <span style="display:contents" v-html="renderIcon('mingcute:clipboard-line', 16)" />
                  样例
                </h2>
                <div v-for="(sample, idx) in problem.samples" :key="idx" class="sample-io" mb-4>
                  <div class="sample-header" flex="~ items-center justify-between">
                    <span><span style="display:contents" v-html="renderIcon('mingcute:arrow-right-line', 14)" /> 样例 {{ idx + 1 }} — 输入</span>
                    <button class="sample-copy-btn" :class="{ copied: copiedSample === `in-${idx}` }" @click="copyWithFeedback(`in-${idx}`, sample.input)">
                      <span v-if="copiedSample === `in-${idx}`" style="display:contents" v-html="renderIcon('mingcute:check-circle-fill', 12)" />
                      <span v-else style="display:contents" v-html="renderIcon('mingcute:copy-line', 12)" />
                      {{ copiedSample === `in-${idx}` ? '已复制' : '复制' }}
                    </button>
                  </div>
                  <pre style="margin:0 0 12px 0"><code>{{ sample.input }}</code></pre>

                  <div class="sample-header" style="border-top: 1px solid var(--bew-border-color)" flex="~ items-center justify-between">
                    <span><span style="display:contents" v-html="renderIcon('mingcute:arrow-left-line', 14)" /> 样例 {{ idx + 1 }} — 输出</span>
                    <button class="sample-copy-btn" :class="{ copied: copiedSample === `out-${idx}` }" @click="copyWithFeedback(`out-${idx}`, sample.output)">
                      <span v-if="copiedSample === `out-${idx}`" style="display:contents" v-html="renderIcon('mingcute:check-circle-fill', 12)" />
                      <span v-else style="display:contents" v-html="renderIcon('mingcute:copy-line', 12)" />
                      {{ copiedSample === `out-${idx}` ? '已复制' : '复制' }}
                    </button>
                  </div>
                  <pre style="margin:0 0 12px 0"><code>{{ sample.output }}</code></pre>

                  <div v-if="sample.explanation" class="sample-header" style="border-top: 1px solid var(--bew-border-color);">
                    <span style="display:contents" v-html="renderIcon('mingcute:bulb-line', 14)" />
                    样例 {{ idx + 1 }} — 说明
                  </div>
                  <div v-if="sample.explanation" p="x-4 y-3" bg="$bew-fill-1" rounded-b="$bew-radius-half" text="sm $bew-text-2">
                    {{ sample.explanation }}
                  </div>
                </div>
              </div>

              <!-- Hint -->
              <div v-if="problem.hint" mt-8>
                <h2 mb-4 flex="~ items-center gap-2">
                  <span style="display:contents" v-html="renderIcon('mingcute:bulb-line', 16)" />
                  提示
                </h2>
                <div v-html="renderedHint" />
              </div>

              <!-- Source -->
              <div v-if="problem.source" mt-8 pt-4 border="t-1 $bew-border-color">
                <span text="sm $bew-text-3">来源：{{ problem.source }}</span>
              </div>
            </div>
          </div>

          <!-- ============================================================ -->
          <!-- Submit Tab (Code Editor) -->
          <!-- ============================================================ -->
          <div
            v-else-if="activeTab === 'submit'"
            key="submit"
            bg="$bew-content" rounded="$bew-radius" p="6 md:p-8"
            shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
            border="1 $bew-border-color"
            style="backdrop-filter: var(--bew-filter-glass-1)"
          >
            <!-- Not logged in warning -->
            <div
              v-if="!isLoggedIn"
              bg="$bew-warning-color-20" border="1 $bew-warning-color" rounded="$bew-radius" p-4 mb-6
              flex="~ items-center gap-3"
            >
              <span style="display:contents; color: var(--bew-warning-color);" v-html="renderIcon('mingcute:warning-line', 24)" />
              <div>
                <p fw-bold text="$bew-text-1">
                  未检测到洛谷登录状态
                </p>
                <p text="sm $bew-text-2">
                  请先在 <a href="https://www.luogu.com.cn" target="_blank" style="color: var(--bew-theme-color); text-decoration: none;" hover="underline">洛谷官网</a> 登录后再提交代码
                </p>
              </div>
            </div>

            <!-- Language + O2 selector -->
            <div flex="~ col md:row gap-4" mb-4 items="end">
              <div flex="~ col gap-1" flex-1>
                <label text="sm $bew-text-2" fw-bold mb-1>编程语言</label>
                <select
                  v-model="selectedLang.id"
                  class="lang-select"
                  bg="$bew-fill-1" rounded="$bew-radius-half" p="x-3 y-2"
                  border="1 $bew-border-color" text="sm $bew-text-1"
                  outline-none cursor-pointer
                  style="backdrop-filter: var(--bew-filter-glass-1)"
                  @change="() => {
                    const lang = LUOGU_LANGUAGES.find(l => l.id === selectedLang.id)
                    if (lang) onLangChange(lang)
                  }"
                >
                  <option v-for="lang in LUOGU_LANGUAGES" :key="lang.id" :value="lang.id">
                    {{ lang.name }}
                  </option>
                </select>
              </div>

              <label
                v-if="selectedLang.canO2"
                flex="~ items-center gap-2" cursor-pointer
                p="x-3 y-2" rounded="$bew-radius-half"
                bg="$bew-fill-1" border="1 $bew-border-color"
              >
                <input v-model="enableO2" type="checkbox">
                <span text="sm $bew-text-2">开启 O2 优化</span>
              </label>
            </div>

            <!-- Code editor -->
            <div mb-4>
              <div ref="cmHost" style="width:100%; height:60vh; min-height:400px; max-height:600px; border:1px solid var(--bew-border-color); border-radius:var(--bew-radius); overflow:hidden" />
            </div>

            <!-- Submit button + messages -->
            <div flex="~ col gap-3">
              <div flex="~ items-center gap-3">
                <Button
                  type="primary"
                  :loading="submitting"
                  :disabled="!isLoggedIn || submitting"
                  @click="handleSubmit"
                >
                  <span style="display:contents" v-html="renderIcon('mingcute:send-line', 16)" />
                  {{ submitting ? '提交中...' : '提交代码' }}
                </Button>

                <Button type="secondary" @click="openLuoguIDE">
                  <span style="display:contents" v-html="renderIcon('mingcute:external-link-line', 16)" />
                  在洛谷 IDE 打开
                </Button>

                <span
                  v-if="submitResult"
                  text="sm"
                  :style="{ color: 'var(--bew-success-color)' }"
                  fw-bold
                >
                  {{ submitResult }}
                </span>
              </div>

              <!-- Captcha -->
              <div
                v-if="captchaSrc" flex="~ col gap-2" mb-4 p-4 bg="$bew-fill-1"
                rounded="$bew-radius" border="1 $bew-border-color"
              >
                <img :src="captchaSrc" style="max-width:200px;border-radius:4px" alt="验证码">
                <div flex="~ items-center gap-2">
                  <input v-model="captchaCode" placeholder="输入验证码" style="flex:1;padding:6px 10px;background:var(--bew-bg);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:4px;font-size:.85em;outline:none" @keydown.enter="handleSubmit">
                  <button :disabled="!captchaCode" style="background:var(--bew-theme-color);color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:.85em;font-weight:600;white-space:nowrap" @click="handleSubmit">
                    提交
                  </button>
                </div>
                <button style="background:none;border:none;color:var(--bew-text-3);cursor:pointer;font-size:.7em" @click="captchaSrc = '';captchaCode = '';submitError = ''">
                  取消
                </button>
              </div>
              <div
                v-if="submitError"
                bg="$bew-error-color-20" border="1 $bew-error-color" rounded="$bew-radius-half" p="x-4 y-3"
                text="sm"
                :style="{ color: 'var(--bew-error-color)' }"
              >
                <div flex="~ items-center justify-between gap-2">
                  <span>{{ submitError }}</span>
                  <button
                    v-if="submitError.includes('验证码')"
                    style="background:var(--bew-theme-color);color:#fff;border:none;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:.82em;font-weight:600;white-space:nowrap;flex-shrink:0"
                    @click="loadCaptcha()"
                  >
                    刷新验证码
                  </button>
                </div>
              </div>

              <!-- Submit history -->
              <div v-if="submitHistory.length > 0" mt-2>
                <div text="xs $bew-text-3" mb-1>
                  最近提交
                </div>
                <div flex="~ col gap-1">
                  <div v-for="h in submitHistory" :key="h.rid" flex="~ items-center gap-2" text="xs">
                    <a
                      :href="`https://www.luogu.com.cn/record/${h.rid}`" target="_blank"
                      style="color:var(--bew-theme-color);text-decoration:none;font-family:monospace"
                    >
                      #{{ h.rid }}
                    </a>
                    <span style="color:var(--bew-text-3)">{{ h.pid }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ============================================================ -->
          <!-- Discussions Tab -->
          <!-- ============================================================ -->
          <div
            v-else-if="activeTab === 'discussions'"
            key="discussions"
            bg="$bew-content" rounded="$bew-radius" p-6
            shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
            border="1 $bew-border-color"
            style="backdrop-filter: var(--bew-filter-glass-1)"
          >
            <div
              v-if="discussions.length === 0" flex="~ col" items="center" justify="center" py-12
              text="$bew-text-2"
            >
              <span style="display:contents" v-html="renderIcon('mingcute:comment-line', 48)" />
              <p text="lg" mt-4 mb-2>
                暂无讨论
              </p>
              <p text="sm $bew-text-3" mb-4>
                这道题目还没有人发起讨论
              </p>
            </div>
            <div v-else>
              <div
                v-for="(d, idx) in discussions" :key="d.id"
                class="stagger-row hover:bg-$bew-fill-2"
                :style="{ '--row-index': idx }"
                p="x-4 y-3" flex="~ items-center gap-4"
                border="b-1 $bew-border-color" cursor="pointer" duration-200
                @click="navigateTo(AppPage.Blog, `https://www.luogu.com.cn/discuss/${d.id}`)"
              >
                <div flex="~ items-center gap-2" shrink-0>
                  <img :src="d.author?.avatar" style="width:24px;height:24px;border-radius:50%;object-fit:cover" @error="(e:any) => { e.target.style.display = 'none' }">
                  <span :style="{ color: d.author?.color ? `var(--bew-${d.author.color})` : 'var(--bew-text-1)', fontWeight: 600, fontSize: 'var(--bew-base-font-size)' }">{{ d.author?.name }}</span>
                </div>
                <div flex="1" min-w-0>
                  <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    {{ d.title }}
                  </div>
                </div>
                <div flex="~ items-center gap-2" shrink-0 style="font-size:.8em;color:var(--bew-text-3)">
                  <span flex="~ items-center gap-1"><span style="display:contents" v-html="renderIcon('mingcute:comment-line', 14)" />{{ d.replyCount }}</span>
                  <span>{{ timeAgo(d.time) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ============================================================ -->
          <!-- Solutions Tab -->
          <!-- ============================================================ -->
          <div
            v-else-if="activeTab === 'solutions'"
            key="solutions"
            bg="$bew-content" rounded="$bew-radius" p-6
            shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
            border="1 $bew-border-color"
            style="backdrop-filter: var(--bew-filter-glass-1)"
          >
            <Loading v-if="solutionsLoading" />
            <div
              v-else-if="solutions.length === 0" flex="~ col" items="center" justify="center" py-12
              text="$bew-text-2"
            >
              <span style="display:contents" v-html="renderIcon('mingcute:bulb-line', 48)" />
              <p text="lg" mt-4 mb-2>
                暂无题解
              </p>
              <p text="sm $bew-text-3" mb-4>
                这道题目还没有题解
              </p>
            </div>
            <div v-else>
              <h2 mb-4 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)">
                题解 ({{ solutions.length }})
              </h2>
              <div
                v-for="(s, idx) in solutions" :key="s.id"
                class="stagger-row hover:bg-$bew-fill-2"
                :style="{ '--row-index': idx }"
                p="x-4 y-3" flex="~ items-center gap-4"
                border="b-1 $bew-border-color" cursor="pointer" duration-200
                @click="navigateTo(AppPage.Solution, `https://www.luogu.com.cn/problem/solution/${problemId}?sid=${s.id}`)"
              >
                <div flex="1" min-w-0>
                  <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    {{ s.title }}
                  </div>
                  <div flex="~ items-center gap-2" mt-1>
                    <img :src="s.author?.avatar" style="width:20px;height:20px;border-radius:50%;object-fit:cover" @error="(e:any) => { e.target.style.display = 'none' }">
                    <span text="xs" :style="{ color: s.author?.color ? `var(--bew-${s.author.color})` : 'var(--bew-text-2)' }">{{ s.author?.name }}</span>
                    <span text="xs $bew-text-3">{{ timeAgo(s.time) }}</span>
                  </div>
                </div>
                <div flex="~ items-center gap-1" shrink-0 text="sm $bew-text-3">
                  <span style="display:contents" v-html="renderIcon('mingcute:thumb-up-line', 14)" />
                  {{ s.votes }}
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss">
@import "~/styles/problemContent.scss";
</style>

<style lang="scss" scoped>
.resize-handle:hover {
  background: var(--bew-fill-2) !important;
}
.lang-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 2rem;
  width: 100%;
  max-width: 300px;
}

.code-editor {
  width: 100%;
  min-height: 400px;
  max-height: 600px;
  padding: 16px;
  font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", "Courier New", monospace;
  font-size: var(--bew-base-font-size);
  line-height: 1.6;
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  resize: vertical;
  outline: none;
  tab-size: 4;

  &:focus {
    border-color: var(--bew-theme-color);
    box-shadow: 0 0 0 2px var(--bew-theme-color-30);
  }

  &::placeholder {
    color: var(--bew-text-4);
  }
}
.sample-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius-half);
  color: var(--bew-text-3);
  font-size: 0.75em;
  padding: 2px 10px;
  cursor: pointer;
  transition: all 0.2s;
  &:hover {
    background: var(--bew-fill-2);
    color: var(--bew-text-1);
  }
  &.copied {
    border-color: var(--bew-success-color-30);
    background: var(--bew-success-color-20);
    color: var(--bew-success-color);
    font-weight: 600;
  }
}
</style>
