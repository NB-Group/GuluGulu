<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { getCsrfToken, ideExecLabel, isLoggedIn as checkLuoguLogin, LUOGU_LANGUAGES, parseErrorLines, parseIdeExecute, pollRecordVerdict, submitCode, friendlyError } from '~/utils/luogu-api'
import type { VerdictResult } from '~/utils/luogu-api'
import { parseMarkdownContent } from '~/utils/markdown'
import { useGulyApp } from '~/composables/useAppProvider'
import { useTween } from '~/composables/useTween'

const { currentUrl } = useGulyApp()

// ============================================================
// Contest ID from URL
// ============================================================
const contestId = computed(() => {
  const url = currentUrl.value || window.location.href
  const m = url.match(/\/contest\/(\d+)/)
  return m ? Number(m[1]) : null
})

// ============================================================
// Data state
// ============================================================
interface ContestProblem {
  pid: string; title: string; score: number; difficulty?: number
  submitted?: number; accepted?: number
}
interface ScoreboardRow {
  rank: number; user: { uid: number; name: string; avatar: string; color: string }
  score: number; scores: (number | null)[]; totalTime?: number; details: Record<string, any>
}

const contest = ref<any>(null)
const loading = ref(true)
const errorMsg = ref('')

const userRegistration = ref<any>(null)
const regLoading = ref(false)
const regMsg = ref('')

const problems = ref<ContestProblem[]>([])
const activeTab = ref<'overview' | 'problems' | 'submit' | 'ranking'>('overview')

// Submit state
const selectedPid = ref('')
const code = ref('')
const lang = ref(28)
const enableO2 = ref(false)
const submitLoading = ref(false)
const submitResult = ref<any>(null)
const verdictResult = ref<VerdictResult | null>(null)
const codeEditorRef = ref<any>(null)
const submitError = ref('')
const captchaSrc = ref('')
const captchaCode = ref('')
const isLoggedIn = computed(() => checkLuoguLogin())
// Self-test state (mirrors ProblemDetail's ide_submit + ws.luogu flow)
const testInput = ref('')
const testExpectedOutput = ref('')
const testActualOutput = ref('')
const testVerdict = ref('')
const testRunning = ref(false)
let activeWs: WebSocket | null = null
let activeWsTimeout: ReturnType<typeof setTimeout> | null = null

// Problem statement
const problemStatement = ref<any>(null)
const statementLoading = ref(false)

// Ranking
const scoreboard = shallowRef<ScoreboardRow[]>([])
const rankingLoading = ref(false)
const rankingPage = ref(1)
const rankingTotal = ref(0)

// ============================================================
// Fetch contest data from page HTML
// ============================================================
async function fetchContestData() {
  if (!contestId.value) { errorMsg.value = '无效的比赛ID'; loading.value = false; return }
  loading.value = true; errorMsg.value = ''
  try {
    const res = await fetch(`https://www.luogu.com.cn/contest/${contestId.value}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const cd = ctx?.data || ctx?.currentData || {}
      contest.value = cd?.contest || cd || null
      if (contest.value) {
        const allProblems = cd?.contestProblems || contest.value.problems || []
        problems.value = allProblems.map((p: any, i: number) => ({
          pid: p.problem?.pid || p.pid || String.fromCharCode(65 + i),
          title: p.problem?.name || p.title || p.name || '',
          score: p.score ?? p.problem?.score ?? 100,
          difficulty: p.problem?.difficulty ?? p.difficulty,
          submitted: p.submitted ?? p.problem?.submitted ?? p.submittedCount ?? 0,
          accepted: p.accepted ?? p.problem?.accepted ?? p.acceptedCount ?? 0,
        }))
        userRegistration.value = cd.joined ? { registered: true } : (contest.value.userRegistration || cd.userRegistration || cd.registration || null)
        const host = cd?.host || contest.value.host; if (host) contest.value.host = host
        const cert = cd?.description || contest.value.description; if (cert) contest.value.description = cert
        const tcr = cd?.totalRegisteredUsers || cd?.registeredCount || contest.value.totalRegisteredUsers; if (tcr) contest.value.totalRegisteredUsers = tcr
        if (!contest.value.ruleType) contest.value.ruleType = cd?.ruleType || 1
      }
    } else {
      errorMsg.value = '未找到比赛数据'
    }
  } catch (e: any) { errorMsg.value = friendlyError(e) }
  loading.value = false
}

// ============================================================
// Registration
// ============================================================
async function handleRegister() {
  regLoading.value = true; regMsg.value = ''
  try {
    const csrf = getCsrfToken()
    const res = await fetch(`https://www.luogu.com.cn/fe/api/contest/join/${contestId.value}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
      body: '{}',
    })
    const json = await res.json()
    if (json?.code === 200 || json?.status === 200 || json?.id) {
      userRegistration.value = { registered: true }
      regMsg.value = '报名成功！'
    } else {
      regMsg.value = json?.data || json?.msg || String(json?.code ?? json?.status ?? '失败')
    }
  } catch (e: any) { regMsg.value = '报名失败：' + (e.message || '网络错误') }
  regLoading.value = false
}


// ============================================================
// Problem statement loading
// ============================================================
async function loadProblem(pid: string) {
  selectedPid.value = pid
  // restore saved code + lang for this problem (per-problem memory)
  try {
    const raw = localStorage.getItem(contestCodeKey(pid))
    if (raw) { const sv = JSON.parse(raw); code.value = sv.code || ''; if (sv.lang) lang.value = sv.lang }
    else code.value = ''
  } catch { code.value = '' }
  testVerdict.value = ''; testActualOutput.value = ''
  statementLoading.value = true
  submitResult.value = null; submitError.value = ''
  problemStatement.value = null
  try {
    const res = await fetch(`https://www.luogu.com.cn/problem/${pid}?contestId=${contestId.value}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      problemStatement.value = ctx?.data?.problem || ctx?.currentData?.problem || null
    }
  } catch { statementLoading.value = false }
  statementLoading.value = false
}

// ============================================================
// Code submission (contest)
// ============================================================
function loadCaptcha() {
  captchaCode.value = ''
  captchaSrc.value = 'https://www.luogu.com.cn/api/verify/captcha?_t=' + Date.now()
}

async function handleSubmit() {
  if (!selectedPid.value) { submitError.value = '请先选择题目'; return }
  if (!code.value.trim()) { submitError.value = '请先输入代码'; return }
  if (!isLoggedIn.value) { submitError.value = '请先登录洛谷'; return }

  submitLoading.value = true
  submitError.value = ''
  submitResult.value = null

  const result = await submitCode({
    contestId: contestId.value!,
    pid: selectedPid.value,
    code: code.value,
    lang: lang.value,
    enableO2: enableO2.value,
    captcha: captchaCode.value || undefined,
  })

  submitLoading.value = false

  // --- Success ---
  if (result.status === 200 && result.rid) {
    captchaSrc.value = ''; captchaCode.value = ''
    submitResult.value = { success: true, rid: result.rid }
    // Poll the record until judged, then surface the verdict via the AC-stamp overlay.
    verdictResult.value = null
    pollRecordVerdict(result.rid).then((v) => {
      verdictResult.value = v
      if (v.verdict === 'CE')
        highlightErrorLines(v.compileMessage)
    })
    return
  }

  // --- Captcha needed ---
  if (result.needCaptcha) {
    submitResult.value = null
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

// ============================================================
// Self-test (custom run) + per-problem code/lang memory
// ============================================================
function cleanupWs() {
  if (activeWsTimeout) { clearTimeout(activeWsTimeout); activeWsTimeout = null }
  if (activeWs) { try { activeWs.close() } catch {} activeWs = null }
}
// CE/RE 报错定位:解析行号 → 编辑器高亮 + 跳转
function highlightErrorLines(msg: string | null | undefined) {
  const ls = parseErrorLines(msg)
  if (ls.length) {
    codeEditorRef.value?.highlightLines(ls)
    codeEditorRef.value?.jumpToLine(ls[0])
  }
}

async function runSelfTest() {
  if (!code.value.trim()) { testVerdict.value = '无代码'; return }
  if (!isLoggedIn.value) { testVerdict.value = '请先登录'; return }
  if (testRunning.value) return
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
      if (resolved) return
      try {
        const j = JSON.parse(xhr.responseText)
        const rid = String(j?.data?.rid ?? '')
        if (rid) { ws.send(JSON.stringify({ type: 'join_channel', channel: 'ide.track', channel_param: rid })) }
        else { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '失败'; testActualOutput.value = j?.errorMessage || 'IDE 提交失败' }
      } catch { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '失败'; testActualOutput.value = 'IDE 返回异常' }
    }
    xhr.onerror = () => { if (!resolved) { resolved = true; cleanupWs(); testRunning.value = false; testVerdict.value = '失败'; testActualOutput.value = '请求失败，请检查网络连接或洛谷状态' } }
    const body = new URLSearchParams({ lang: String(lang.value), code: code.value, input: testInput.value, o2: enableO2.value ? '1' : '0', 'csrf-token': csrf })
    xhr.send(body.toString())
  }
  ws.onmessage = (event) => {
    if (resolved) return
    try {
      const msg = JSON.parse(event.data)
      console.debug('[GuluGulu] ide ws msg', msg)
      if (msg._ws_type === 'server_broadcast' && msg.type === 'execute') {
        resolved = true; cleanupWs(); testRunning.value = false
        console.debug('[GuluGulu] ide execute', msg)
        const ideRes = parseIdeExecute(msg.execute || {}, msg, testExpectedOutput.value.trim())
        testVerdict.value = ideExecLabel(ideRes)
        testActualOutput.value = ideRes.output
        if (ideRes.verdict === 'CE' && ideRes.message)
          highlightErrorLines(ideRes.message)
      }
      else if (msg._ws_type === 'server_broadcast' && msg.desc) {
        resolved = true; cleanupWs(); testRunning.value = false
        testVerdict.value = 'CE · 编译错误'
        testActualOutput.value = String(msg.desc)
        highlightErrorLines(String(msg.desc))
      }
    } catch {}
  }
}
// per-problem code + lang persistence
function contestCodeKey(pid: string) { return `gulugulu-contest-code-${pid}` }
let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleContestSave() {
  if (!selectedPid.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(contestCodeKey(selectedPid.value), JSON.stringify({ code: code.value, lang: lang.value, ts: Date.now() })) } catch {}
  }, 500)
}
watch([code, lang], scheduleContestSave)

// ============================================================
// Ranking / Scoreboard
// ============================================================
async function fetchScoreboard(page = 1) {
  rankingLoading.value = true
  try {
    const res = await fetch(`https://www.luogu.com.cn/fe/api/contest/scoreboard/${contestId.value}?page=${page}`, { credentials: 'same-origin' })
    const json = await res.json()
    const data = json?.data || json?.currentData || json
    if (data?.scoreboard?.result) {
      const items = data.scoreboard.result.map((r: any, i: number) => ({
        rank: r.rank || r.idx || (i + 1),
        user: { uid: r.user?.uid || r.uid, name: r.user?.name || r.name || '', avatar: r.user?.avatar || `https://cdn.luogu.com.cn/upload/usericon/${r.user?.uid || r.uid}.png`, color: r.user?.color || r.color || '' },
        score: r.score || r.totalScore || 0,
        scores: r.scores || r.problemScores || [],
        details: r.details || {},
        totalTime: r.totalTime || r.time || 0,
      }))
      scoreboard.value = page === 1 ? items : [...scoreboard.value, ...items]
      rankingTotal.value = data.scoreboard.count || scoreboard.value.length
    }
  } catch { scoreboard.value = [] }
  rankingLoading.value = false
}

// ============================================================
// Helpers
// ============================================================
const c = computed(() => contest.value || {})
const nowTs = ref(Math.floor(Date.now() / 1000))
// Arm the 1s tick only while the countdown is meaningful (contest not yet
// ended). Without this gate the entire ~800-line template — including the
// scoreboard v-for — re-renders every second even when the contest is long
// over. disarmNowTimer stops the interval once nowTs crosses endTime; the
// watch below re-arms it if contest data later loads with a future endTime.
let nowTimer: ReturnType<typeof setInterval> | null = null
function armNowTimer() {
  if (nowTimer) return
  nowTimer = setInterval(() => { nowTs.value = Math.floor(Date.now() / 1000) }, 1000)
}
function disarmNowTimer() {
  if (nowTimer) { clearInterval(nowTimer); nowTimer = null }
}
watch(
  () => { const e = c.value?.endTime || 0; return e > 0 && nowTs.value < e },
  (active) => { if (active) armNowTimer(); else disarmNowTimer() },
  { immediate: true },
)
onUnmounted(() => disarmNowTimer())
onUnmounted(() => { cleanupWs(); if (saveTimer) clearTimeout(saveTimer) })

// Parsed contest description. Used in two v-html bindings (sidebar + overview)
// — computing once here avoids re-parsing the same markdown twice per render,
// and (with T1's timer gated) avoids any re-parse on unrelated re-renders.
const renderedDescription = computed(() => parseMarkdownContent(c.value?.description || ''))

const contestStatus = computed(() => {
  const now = nowTs.value
  const s = c.value?.startTime || 0
  const e = c.value?.endTime || 0
  const phase = now < s ? 'upcoming' : now < e ? 'ongoing' : 'ended'
  return {
    upcoming: s > 0 && phase === 'upcoming',
    ongoing: phase === 'ongoing',
    ended: e > 0 && phase === 'ended',
    label: phase === 'ongoing' ? '进行中' : phase === 'ended' ? '已结束' : '即将开始',
    color: phase === 'ongoing' ? '#52c41a' : phase === 'ended' ? '#ff4d4f' : '#1890ff',
  }
})
const isRegistered = computed(() => userRegistration.value?.registered || userRegistration.value?.isRegistered || false)
const registeredCount = computed(() => c.value.registrationCount || c.value.registeredCount || 0)
const timeRange = computed(() => {
  const fmt = (ts: number) => ts ? new Date(ts * 1000).toLocaleString('zh-CN') : '?'
  return `${fmt(c.value.startTime)} — ${fmt(c.value.endTime)}`
})
const duration = computed(() => {
  const d = (c.value.endTime || 0) - (c.value.startTime || 0)
  if (d <= 0) return ''
  const h = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60)
  return h > 0 ? `${h}小时${m > 0 ? m + '分钟' : ''}` : `${m}分钟`
})
const canAccessContent = computed(() => isRegistered.value && !contestStatus.value.upcoming)

function countdown(): string {
  const now = nowTs.value
  const start = c.value.startTime || 0; const end = c.value.endTime || 0
  if (now < start) {
    const d = start - now
    if (d >= 86400) return `距开始 ${Math.floor(d / 86400)} 天 ${Math.floor((d % 86400) / 3600)} 小时`
    const h = Math.floor(d / 3600); const m = Math.floor((d % 3600) / 60)
    return `距开始 ${h} 小时 ${m} 分钟`
  }
  if (now < end) {
    const d = end - now
    if (d >= 86400) return `距结束 ${Math.floor(d / 86400)} 天 ${Math.floor((d % 86400) / 3600)} 小时`
    const h = Math.floor(d / 3600); const m = Math.floor((d % 3600) / 60)
    return `距结束 ${h}:${String(m).padStart(2, '0')}`
  }
  return ''
}
function problemLabel(idx: number) { return String.fromCharCode(65 + idx) }
// ---- Scoreboard redesign (direction B) helpers ----
// Medal styling for the top-3 ribbon. Gold/silver/bronze tint + accent border.
function rankInfo(rank: number) {
  if (rank === 1) return { icon: 'mingcute:medal-fill', color: '#f2c200', bg: 'rgba(242,194,0,.10)', border: '#f2c200' }
  if (rank === 2) return { icon: 'mingcute:medal-fill', color: '#9aa3ad', bg: 'rgba(154,163,173,.12)', border: '#9aa3ad' }
  if (rank === 3) return { icon: 'mingcute:medal-fill', color: '#c47d3a', bg: 'rgba(196,125,58,.12)', border: '#c47d3a' }
  return { icon: '', color: 'var(--bew-text-1)', bg: '', border: '' }
}
// Left-edge accent for a row: my-row uses theme color, medalists use their
// medal color, others get nothing.
function rankAccent(rank: number, isMine: boolean): Record<string, string> {
  if (isMine) return { boxShadow: 'inset 3px 0 0 var(--bew-theme-color)' }
  const ri = rankInfo(rank)
  return ri.border ? { boxShadow: `inset 3px 0 0 ${ri.border}` } : {}
}
// Color-block style for one problem score. Full=green, partial=amber heatmap
// (alpha scales with attainment), zero=red tint, null=muted grey.
function scoreBlockStyle(sc: number | null, max: number): Record<string, string> {
  if (sc == null) return { background: 'var(--bew-fill-2)', color: 'var(--bew-text-4)' }
  if (sc >= max) return { background: 'var(--bew-success-color-20)', color: 'var(--bew-success-color)' }
  if (sc === 0) return { background: 'var(--bew-error-color-20)', color: 'var(--bew-error-color)' }
  const r = Math.min(1, sc / max)
  return { background: `rgba(245, 158, 11, ${(0.12 + r * 0.30).toFixed(3)})`, color: 'var(--bew-warning-color)' }
}

function openUser(uid: number) { window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank') }
function openOriginal() { window.open(`https://www.luogu.com.cn/contest/${contestId.value}`, '_blank') }
function openRecord(rid: number) { window.open(`https://www.luogu.com.cn/record/${rid}`, '_blank') }

// Current user's per-problem scores (from the scoreboard), so the problem list
// shows real attainment instead of the always-100 max. Null until the
// scoreboard loads or if the user isn't on it (not registered / not started).
const myUid = computed(() => Number((window as any).__guly_user?.uid) || 0)
// 每行按当前 problems 顺序从 details 派生每题分 + 预计算每个格子的色块样式。
// 派生放 computed 里:① 对齐避免 fetch 时 problems 未就绪的竞态;② memoize 后只在
// scoreboard/problems 变化时重算——否则进行中的比赛每秒 nowTs tick 触发整组件重渲染,
// 排名表 200×10 个格子会每秒各调一次 scoreBlockStyle(各自新建对象)。
const scoreboardView = computed(() => scoreboard.value.map((row) => {
  const scores = problems.value.map(p => row.details?.[p.pid]?.score ?? null)
  return {
    ...row,
    scores,
    cells: scores.map((s, i) => ({
      style: scoreBlockStyle(s, problems.value[i]?.score || 100),
      text: s != null ? s : '-',
    })),
  }
}))
// My contest standing — drives the rich "我的成绩" sidebar card + 排名置顶行。
const myRow = computed(() => scoreboardView.value.find(r => r.user.uid === myUid.value) || null)
const myScores = computed(() => myRow.value?.scores ?? null)
const myRank = computed(() => myRow.value?.rank ?? null)
const myTotalScore = computed(() => myRow.value?.score ?? null)
// Animate the centerpiece total score as it loads (0 → final). Counting up a
// rank would look odd, so only the score tweens.
const tweenedTotal = useTween(computed(() => myRow.value?.score ?? 0))
const myPassedCount = computed(() => {
  const s = myScores.value
  if (!s) return 0
  return s.reduce((n, v, i) => n + (v != null && v >= (problems.value[i]?.score || 100) ? 1 : 0), 0)
})

onMounted(() => {
  fetchContestData()
  fetchScoreboard() // best-effort (catches internally); enables per-problem my-score
})
watch(contestId, () => { if (contestId.value) fetchContestData() })
watch(activeTab, (t) => { if (t === 'ranking' && scoreboard.value.length === 0) fetchScoreboard() })
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <Loading v-if="loading" />
    <div v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" text="center $bew-text-2" style="backdrop-filter:var(--bew-filter-glass-1)">
      <span v-html="renderIcon('mingcute:warning-line', 32)" style="display:contents" /><p mt-2>{{ errorMsg }}</p>
    </div>

    <Transition name="content-reveal">
      <div v-if="!loading && contest" w-full flex="~ col lg:row gap-6" class="lg:flex-wrap" items="start">
        <!-- Sticky contest title bar — pinned at the very top, always visible -->
        <div w-full flex="~ col gap-2" class="lg:flex-row lg:items-center" style="position:sticky; top:calc(var(--bew-top-bar-height) + 8px); z-index:9; padding:8px 12px; background:var(--bew-content); border:1px solid var(--bew-border-color); border-radius:var(--bew-radius); backdrop-filter:var(--bew-filter-glass-1); box-shadow:var(--bew-shadow-1); margin-bottom:8px">
          <div flex="~ items-center gap-2" min-w-0 class="w-full lg:w-auto lg:flex-1">
            <span v-html="renderIcon(contestStatus.ongoing ? 'mingcute:play-fill' : contestStatus.ended ? 'mingcute:trophy-fill' : 'mingcute:time-line', 16)" :style="{ display: 'contents', color: contestStatus.color }" />
            <span text="xs" fw-bold px-2.5 py-1 rounded-full flex-shrink-0 :style="{ background: contestStatus.color + '20', color: contestStatus.color }">{{ contestStatus.label }}</span>
            <h1 style="font-size:1.1rem;color:var(--bew-text-1);font-weight:700;margin:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.name }}</h1>
          </div>
          <div v-if="c.rated || countdown()" flex="~ items-center gap-2" flex-shrink-0 class="lg:ml-auto">
            <span v-if="c.rated" text="xs" fw-bold px-2.5 py-1 rounded-full style="background:var(--bew-warning-color-20);color:var(--bew-warning-color)">Rated</span>
            <span v-if="countdown()" text="xs" fw-bold px-2.5 py-1 rounded-full style="background:var(--bew-error-color-20);color:var(--bew-error-color)">{{ countdown() }}</span>
          </div>
        </div>
        <!-- ============================================================ -->
        <!-- Left column: Contest meta sidebar (sticky on md+) -->
        <!-- ============================================================ -->
        <div min-w-0 w-full class="contest-sidebar-col lg:order-2 lg:w-80 lg:shrink-0">
          <div class="contest-sidebar" bg="$bew-content" rounded="$bew-radius" p-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
            <!-- 我的成绩 — rich centerpiece -->
            <div v-if="isLoggedIn" p-5 style="background:linear-gradient(135deg,var(--bew-theme-color-20),transparent);border-bottom:1px solid var(--bew-border-color)">
              <div flex="~ items-center justify-between" mb-3>
                <span style="font-size:.75em;color:var(--bew-text-3);font-weight:600;letter-spacing:.05em">我的成绩</span>
                <span v-if="isRegistered" text="xs" px-2 py-0.5 rounded-full style="background:var(--bew-success-color-20);color:var(--bew-success-color);font-weight:600">已报名</span>
                <span v-else text="xs" px-2 py-0.5 rounded-full style="background:var(--bew-fill-2);color:var(--bew-text-3)">未报名</span>
              </div>
              <div flex="~ items-end gap-5" mb-3>
                <div>
                  <div style="font-size:.7em;color:var(--bew-text-3);margin-bottom:2px">排名</div>
                  <div flex="~ items-center gap-1" style="font-size:1.55rem;font-weight:800;line-height:1;color:var(--bew-text-1)">
                    <span v-html="renderIcon('mingcute:medal-fill', 22)" :style="{ display:'contents', color: (myRank != null && myRank <= 3) ? 'var(--bew-warning-color)' : 'var(--bew-theme-color)' }" />
                    <span>{{ myRank != null ? '#' + myRank : '—' }}</span>
                  </div>
                </div>
                <div style="flex:1">
                  <div style="font-size:.7em;color:var(--bew-text-3);margin-bottom:2px">总分</div>
                  <div style="font-size:1.55rem;font-weight:800;line-height:1;color:var(--bew-theme-color)">{{ myTotalScore != null ? Math.round(tweenedTotal) : 0 }}</div>
                </div>
              </div>
              <div>
                <div flex="~ items-center justify-between" mb-1 style="font-size:.72em;color:var(--bew-text-3)">
                  <span flex="~ items-center gap-1"><span v-html="renderIcon('mingcute:check-circle-fill', 14)" style="display:contents;color:var(--bew-success-color)" />通过题目</span>
                  <span style="color:var(--bew-text-2);font-weight:600">{{ myPassedCount }} / {{ problems.length }}</span>
                </div>
                <div style="height:6px;border-radius:99px;background:var(--bew-fill-2);overflow:hidden">
                  <div :style="{ width: (problems.length ? Math.round(myPassedCount / problems.length * 100) : 0) + '%', height: '100%', background: 'var(--bew-theme-color)', borderRadius: '99px', transition: 'width .4s' }" />
                </div>
                <!-- 每题部分分明细 -->
                <div v-if="myScores" mt-3 flex="~ wrap gap-1">
                  <span
                    v-for="(s, i) in myScores" :key="i" text="xs" px-1.5 py-0.5 rounded
                    style="font-weight:600;line-height:1.6"
                    :style="{ background: s != null && s >= (problems[i]?.score||100) ? 'var(--bew-success-color-20)' : s != null ? 'var(--bew-error-color-20)' : 'var(--bew-fill-2)', color: s != null && s >= (problems[i]?.score||100) ? 'var(--bew-success-color)' : s != null ? 'var(--bew-error-color)' : 'var(--bew-text-4)' }"
                  >{{ problemLabel(i) }} {{ s != null ? s : '-' }}</span>
                </div>
                <div v-if="!myRow && isRegistered" mt-2 style="font-size:.7em;color:var(--bew-text-3)">比赛开始或有提交后显示成绩</div>
              </div>
            </div>
            <!-- 比赛信息 — icon meta rows -->
            <div p-5 flex="~ col gap-3.5">
              <div flex="~ items-center gap-3" style="font-size:var(--bew-base-font-size)">
                <span v-html="renderIcon('mingcute:trophy-line', 18)" style="display:contents;color:var(--bew-theme-color);flex-shrink:0" />
                <span style="color:var(--bew-text-3);width:2.5em;flex-shrink:0;font-size:.9em">赛制</span>
                <span flex="~ items-center gap-1.5" min-w-0 style="color:var(--bew-text-1);font-weight:500">
                  <span>{{ c.ruleType || c.type || 'OI' }}</span>
                  <span v-if="c.rated" text="xs" px-1.5 py-0.5 rounded style="background:var(--bew-warning-color-20);color:var(--bew-warning-color);font-weight:600">Rated</span>
                </span>
              </div>
              <div v-if="c.host" flex="~ items-center gap-3" style="font-size:var(--bew-base-font-size)">
                <span v-html="renderIcon('mingcute:user-3-line', 18)" style="display:contents;color:var(--bew-theme-color);flex-shrink:0" />
                <span style="color:var(--bew-text-3);width:2.5em;flex-shrink:0;font-size:.9em">主办</span>
                <span flex="~ items-center gap-1.5" min-w-0 style="color:var(--bew-text-1);font-weight:500">
                  <img :src="c.host.avatar" style="width:18px;height:18px;border-radius:50%;flex-shrink:0;object-fit:cover" @error="(e:any) => e.target.style.display='none'" />
                  <span :style="{ color: `var(--bew-${c.host.color})`, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }">{{ c.host.name }}</span>
                </span>
              </div>
              <div flex="~ items-start gap-3" style="font-size:var(--bew-base-font-size)">
                <span v-html="renderIcon('mingcute:time-line', 18)" style="display:contents;color:var(--bew-theme-color);flex-shrink:0;margin-top:1px" />
                <span style="color:var(--bew-text-3);width:2.5em;flex-shrink:0;font-size:.9em;margin-top:1px">时间</span>
                <span style="color:var(--bew-text-1);font-weight:500;font-size:.88em;line-height:1.45">{{ timeRange }}</span>
              </div>
              <div flex="~ items-center gap-3" style="font-size:var(--bew-base-font-size)">
                <span v-html="renderIcon('mingcute:watch', 18)" style="display:contents;color:var(--bew-theme-color);flex-shrink:0" />
                <span style="color:var(--bew-text-3);width:2.5em;flex-shrink:0;font-size:.9em">时长</span>
                <span style="color:var(--bew-text-1);font-weight:500">{{ duration || '—' }}</span>
              </div>
              <div flex="~ items-center gap-3" style="font-size:var(--bew-base-font-size)">
                <span v-html="renderIcon('mingcute:document-line', 18)" style="display:contents;color:var(--bew-theme-color);flex-shrink:0" />
                <span style="color:var(--bew-text-3);width:2.5em;flex-shrink:0;font-size:.9em">题目</span>
                <span style="color:var(--bew-text-1);font-weight:500">{{ problems.length }} 题</span>
              </div>
              <div v-if="registeredCount > 0 || c.totalRegisteredUsers" flex="~ items-center gap-3" style="font-size:var(--bew-base-font-size)">
                <span v-html="renderIcon('mingcute:user-add-line', 18)" style="display:contents;color:var(--bew-theme-color);flex-shrink:0" />
                <span style="color:var(--bew-text-3);width:2.5em;flex-shrink:0;font-size:.9em">报名</span>
                <span style="color:var(--bew-text-1);font-weight:500">{{ registeredCount || c.totalRegisteredUsers }} 人</span>
              </div>
              <div v-if="c.description" mt-2 p-3 rounded="$bew-radius" bg="$bew-fill-1" style="max-height:160px;overflow-y:auto">
                <div class="markdown-body" style="font-size:.86em;color:var(--bew-text-2);line-height:1.7" v-html="renderedDescription" />
              </div>
              <div v-if="!contestStatus.ended" mt-1>
                <Button v-if="!isRegistered" type="primary" :loading="regLoading" w-full @click="handleRegister">
                  <span v-html="renderIcon('mingcute:user-add-line', 16)" style="display:contents" /> 报名参赛
                </Button>
                <div v-else text="center" px-3 py-2 rounded-full style="font-size:var(--bew-base-font-size);background:var(--bew-success-color-20);color:var(--bew-success-color);font-weight:600">已报名</div>
              </div>
              <div v-if="regMsg" style="font-size:.82em;color:var(--bew-success-color)">{{ regMsg }}</div>
              <div v-if="contestStatus.ended" style="font-size:.82em;color:var(--bew-text-3)">比赛已结束</div>
              <div v-if="!canAccessContent && isRegistered" p-3 rounded="$bew-radius" style="background:var(--bew-warning-color-20);color:var(--bew-warning-color);font-size:.82em">比赛尚未开始，开始后可查看题目与提交</div>
            </div>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- Main content (tab bar + tabs). Left column on md+, scrollable. -->
        <!-- ============================================================ -->
        <div flex="1" min-w-0 w-full class="lg:order-1" style="overflow-x:clip">

          <!-- ============================================================ -->
          <!-- Tab Bar -->
          <!-- ============================================================ -->
          <div bg="$bew-content" rounded="$bew-radius" mb-4 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden">
            <div flex="~" border="b-1 $bew-border-color" overflow="x-auto">
              <template v-for="tab in (['overview','problems','submit','ranking'] as const)" :key="tab">
                <button v-if="tab==='overview' || canAccessContent" flex="~ items-center justify-center gap-1.5" flex-shrink-0 style="background:none;border:none;cursor:pointer;padding:11px 18px;font-size:var(--bew-base-font-size);font-weight:600;transition:color .2s,border-bottom-color .2s,box-shadow .25s" :style="{ color: activeTab === tab ? 'var(--bew-theme-color)' : 'var(--bew-text-3)', borderBottom: activeTab === tab ? '2px solid var(--bew-theme-color)' : '2px solid transparent', boxShadow: activeTab === tab ? '0 4px 16px -4px var(--bew-theme-color-30)' : 'none' }" @click="activeTab = tab">
                  <span v-html="renderIcon({ overview: 'mingcute:information-line', problems: 'mingcute:document-line', submit: 'mingcute:code-line', ranking: 'mingcute:chart-bar-line' }[tab], 16)" style="display:contents" />
                  {{ { overview: '概览', problems: '题目', submit: '提交', ranking: '排名' }[tab] }}
                </button>
              </template>
            </div>
          </div>

          <!-- ============================================================ -->
          <!-- Tab: Overview -->
          <!-- ============================================================ -->
          <div v-if="activeTab === 'overview'" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
            <div v-if="c.description" class="markdown-body" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);line-height:1.8" v-html="renderedDescription" />
            <div v-else style="text-align:center;padding:40px;color:var(--bew-text-3);font-size:var(--bew-base-font-size)">
              <span v-html="renderIcon('mingcute:information-line', 48)" style="display:contents" /><p mt-2>暂无比赛介绍</p>
            </div>
          </div>

          <!-- ============================================================ -->
          <!-- Tab: Problems -->
          <!-- ============================================================ -->
          <div v-if="activeTab === 'problems'" bg="$bew-content" rounded="$bew-radius" mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden">
            <a v-for="(p, idx) in problems" :key="p.pid" :href="`https://www.luogu.com.cn/problem/${p.pid}?contestId=${contestId}#ide`" target="_blank" class="stagger-row hover-row" :style="{ '--row-index': idx, textDecoration: 'none', color: 'inherit' }" flex="~ items-center" px-6 py-4 border="b-1 $bew-border-color" duration-200>
              <span style="width:32px;font-size:var(--bew-base-font-size);color:var(--bew-text-2);font-weight:700;flex-shrink:0">{{ problemLabel(idx) }}</span>
              <div flex="1" min-w-0 mx-3>
                <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600">{{ p.pid }} {{ p.title }}</div>
                <span text="xs" mt-0.5 inline-block style="background:var(--bew-fill-2);color:var(--bew-text-3);font-weight:600;padding:1px 6px;border-radius:var(--bew-radius-half)">{{ p.score }}分</span>
              </div>
              <span style="font-size:var(--bew-base-font-size);font-weight:600;flex-shrink:0" :style="{ color: ((myScores && myScores[idx] != null) || p.accepted) ? 'var(--bew-success-color)' : 'var(--bew-text-4)' }">{{ (myScores && myScores[idx] != null) ? `${myScores[idx]} 分` : (p.accepted ? '已通过' : (p.submitted ? '已提交' : '未提交')) }}</span>
              <button ml-4 mt-0 style="background:var(--bew-theme-color-20);color:var(--bew-theme-color);border:none;border-radius:var(--bew-radius);padding:3px 12px;cursor:pointer;font-size:.8em;font-weight:600" @click.prevent="activeTab='submit';selectedPid=p.pid;loadProblem(p.pid)">提交</button>
            </a>
            <div v-if="problems.length === 0" text="center" p-8 style="color:var(--bew-text-3);font-size:var(--bew-base-font-size)">暂无题目</div>
          </div>

          <!-- ============================================================ -->
          <!-- Tab: Submit -->
          <!-- ============================================================ -->
          <div v-if="activeTab === 'submit'" flex="~ col md:row" gap-4 mb-6>
            <!-- Problem selector + editor -->
            <div flex="1" bg="$bew-content" rounded="$bew-radius" p-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
              <!-- Problem selector -->
              <div mb-4>
                <label style="font-size:var(--bew-base-font-size);color:var(--bew-text-2);font-weight:600" mb-2 block>选择题目</label>
                <select v-model="selectedPid" style="width:100%;padding:8px 12px;background:var(--bew-fill-1);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:var(--bew-radius);font-size:var(--bew-base-font-size)" @change="loadProblem(selectedPid)">
                  <option value="">-- 请选择题目 --</option>
                  <option v-for="(p, idx) in problems" :key="p.pid" :value="p.pid">{{ problemLabel(idx) }}. {{ p.title }} ({{ p.score }}分)</option>
                </select>
              </div>

              <!-- Problem statement (condensed) -->
              <div v-if="statementLoading" p-4 text="center"><Loading /></div>
              <div v-if="!statementLoading && problemStatement" bg="$bew-fill-1" rounded="$bew-radius" p-4 mb-4 style="max-height:300px;overflow-y:auto;font-size:var(--bew-base-font-size);color:var(--bew-text-2)">
                <div fw-bold mb-2 style="color:var(--bew-text-1)">{{ problemStatement.pid }} {{ problemStatement.title }}</div>
                <div style="white-space:pre-wrap" v-text="(problemStatement.background||'')+' '+(problemStatement.description||'').replace(/<[^>]+>/g,'').slice(0,800)+(problemStatement.description?.length>800?'...':'')" />
              </div>

              <!-- Code editor: CodeMirror + completion + per-problem lang memory -->
              <CodeEditor
                ref="codeEditorRef"
                :languages="LUOGU_LANGUAGES"
                :model-value="code"
                @update:model-value="code = $event"
                :lang="lang"
                @update:lang="lang = $event"
                :enable-o2="enableO2"
                @update:enable-o2="enableO2 = $event"
                :show-o2="true"
                :loading="submitLoading"
                :disabled="!selectedPid"
                @submit="handleSubmit"
              />
              <!-- Captcha -->
              <div v-if="captchaSrc" mt-3 flex="~ col gap-2" p-3 bg="$bew-fill-1" rounded="$bew-radius" border="1 $bew-border-color">
                <img :src="captchaSrc" style="max-width:200px;border-radius:4px" alt="验证码" />
                <div flex="~ items-center gap-2">
                  <input v-model="captchaCode" placeholder="输入验证码" style="flex:1;padding:6px 10px;background:var(--bew-bg);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:4px;font-size:.85em;outline:none" @keydown.enter="handleSubmit" />
                  <button :disabled="!captchaCode" @click="handleSubmit" style="background:var(--bew-theme-color);color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:.85em;font-weight:600;white-space:nowrap">
                    提交
                  </button>
                </div>
                <button @click="captchaSrc='';captchaCode='';submitError=''" style="background:none;border:none;color:var(--bew-text-3);cursor:pointer;font-size:.7em;align-self:flex-start">取消</button>
              </div>
              <div v-if="submitError" mt-3 p-3 rounded="$bew-radius" flex="~ items-center justify-between gap-2" style="background:var(--bew-error-color-20);color:var(--bew-error-color);font-size:var(--bew-base-font-size)">
                <span>{{ submitError }}</span>
                <button v-if="submitError.includes('验证码')" @click="loadCaptcha()" style="background:var(--bew-theme-color);color:#fff;border:none;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:.82em;font-weight:600;white-space:nowrap;flex-shrink:0">刷新验证码</button>
              </div>
              <div v-if="submitResult?.success" mt-3 p-3 rounded="$bew-radius" style="background:var(--bew-success-color-20);color:var(--bew-success-color);font-size:var(--bew-base-font-size)">
                提交成功！
                <span v-if="submitResult.rid" style="color:var(--bew-theme-color);cursor:pointer;font-weight:600" @click="openRecord(submitResult.rid)">查看记录 #{{ submitResult.rid }}</span>
              </div>
              <!-- Self-test panel (ide_submit + ws.luogu, mirrors ProblemDetail) -->
              <div mt-4 p-4 rounded="$bew-radius" bg="$bew-fill-1" border="1 $bew-border-color">
                <div flex="~ items-center justify-between" mb-2>
                  <span fw-bold style="color:var(--bew-text-1);font-size:var(--bew-base-font-size)">自测</span>
                  <span v-if="testVerdict" text="xs" px-2 py-0.5 rounded-full fw-bold :style="{ background: testVerdict.startsWith('AC') || testVerdict.startsWith('运行完成') ? 'var(--bew-success-color-20)' : 'var(--bew-error-color-20)', color: testVerdict.startsWith('AC') || testVerdict.startsWith('运行完成') ? 'var(--bew-success-color)' : 'var(--bew-error-color)' }">{{ testVerdict }}</span>
                </div>
                <div flex="~ col gap-2">
                  <div>
                    <div text="xs $bew-text-3" mb-1>自测输入</div>
                    <textarea v-model="testInput" class="selftest-area" rows="3" placeholder="输入数据..." spellcheck="false" />
                  </div>
                  <div>
                    <Button type="secondary" :loading="testRunning" :disabled="!selectedPid || !isLoggedIn" @click="runSelfTest">
                      <span v-html="renderIcon('mingcute:play-fill', 16)" style="display:contents" /> {{ testRunning ? '运行中...' : '运行测试' }}
                    </Button>
                  </div>
                  <div>
                    <div text="xs $bew-text-3" mb-1>期望输出(可选,留空只看实际输出)</div>
                    <textarea v-model="testExpectedOutput" class="selftest-area" rows="3" placeholder="期望输出..." spellcheck="false" />
                  </div>
                  <div>
                    <div text="xs $bew-text-3" mb-1>实际输出</div>
                    <pre class="selftest-output">{{ testActualOutput }}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ============================================================ -->
          <!-- Tab: Ranking -->
          <!-- ============================================================ -->
          <div v-if="activeTab === 'ranking'" bg="$bew-content" rounded="$bew-radius" mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden">
            <Loading v-if="rankingLoading" />
            <div v-if="!rankingLoading && scoreboard.length === 0" text="center" p-8 style="color:var(--bew-text-3);font-size:var(--bew-base-font-size)">
              <span v-html="renderIcon('mingcute:chart-bar-line', 48)" style="display:contents" /><p mt-2>暂无排名数据{{ contestStatus.upcoming ? '（比赛尚未开始）' : '' }}</p>
            </div>
            <!-- Scoreboard: color-block matrix + medal ribbon -->
            <div v-if="scoreboard.length > 0" class="rank-scroll" style="max-height:calc(100vh - var(--bew-top-bar-height) - 170px);overflow:auto">
              <table class="rank-table" style="width:100%;border-collapse:collapse;font-size:var(--bew-base-font-size)">
                <thead>
                  <tr class="rank-head" text="left">
                    <th class="rk rk-rank">#</th>
                    <th class="rk rk-user">选手</th>
                    <th v-for="(_p, pi) in problems" :key="pi" class="rk rk-prob" text="center">{{ problemLabel(pi) }}</th>
                    <th class="rk rk-total" text="right">总分</th>
                  </tr>
                </thead>
                <tbody>
                  <!-- 我的排名:置顶且 sticky,向下滚动时固定在屏幕上方 -->
                  <tr v-if="myRow" class="rank-row rank-mine rank-sticky stagger-row" :style="{ '--row-index': 0 }" cursor="pointer" @click="openUser(myRow.user.uid)">
                    <td class="rk rk-rank" text="center" :style="rankAccent(myRow.rank, true)">
                      <span class="rk-inline">
                        <span v-if="rankInfo(myRow.rank).icon" v-html="renderIcon(rankInfo(myRow.rank).icon, 14)" :style="{ color: rankInfo(myRow.rank).color }" />
                        <span fw-bold style="color:var(--bew-theme-color)">{{ myRow.rank }}</span>
                      </span>
                    </td>
                    <td class="rk rk-user">
                      <span class="rk-inline">
                        <img :src="myRow.user.avatar" style="width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0" @error="(e:any) => e.target.style.display='none'" />
                        <span class="rk-name" style="color:var(--bew-theme-color);font-weight:700">{{ myRow.user.name }}<span style="color:var(--bew-text-3);font-weight:400">（我）</span></span>
                      </span>
                    </td>
                    <td v-for="(cell, si) in myRow.cells" :key="si" class="rk rk-prob" text="center">
                      <span class="score-block" :style="cell.style">{{ cell.text }}</span>
                    </td>
                    <td class="rk rk-total" text="right" fw-bold style="color:var(--bew-theme-color)">{{ myRow.score }}</td>
                  </tr>
                  <tr v-for="(row, idx) in scoreboardView" :key="row.rank" class="rank-row stagger-row" :class="{ 'rank-mine': row.user.uid === myUid }" :style="{ '--row-index': idx + 1, background: rankInfo(row.rank).bg }" border="b-1 $bew-border-color" duration-150 cursor="pointer" @click="openUser(row.user.uid)">
                    <td class="rk rk-rank" text="center" :style="rankAccent(row.rank, false)">
                      <span class="rk-inline">
                        <span v-if="rankInfo(row.rank).icon" v-html="renderIcon(rankInfo(row.rank).icon, 14)" :style="{ color: rankInfo(row.rank).color }" />
                        <span fw-bold :style="{ color: rankInfo(row.rank).color }">{{ row.rank }}</span>
                      </span>
                    </td>
                    <td class="rk rk-user">
                      <span class="rk-inline">
                        <img :src="row.user.avatar" style="width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0" @error="(e:any) => e.target.style.display='none'" />
                        <span class="rk-name" :style="{ color: row.user.color ? `var(--bew-${row.user.color})` : 'var(--bew-text-1)', fontWeight: 600 }">{{ row.user.name }}</span>
                      </span>
                    </td>
                    <td v-for="(cell, si) in row.cells" :key="si" class="rk rk-prob" text="center">
                      <span class="score-block" :style="cell.style">{{ cell.text }}</span>
                    </td>
                    <td class="rk rk-total" text="right" fw-bold style="color:var(--bew-text-1)">{{ row.score }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="rankingTotal > scoreboard.length" p-4 text="center">
              <Button type="secondary" @click="rankingPage++;fetchScoreboard(rankingPage)">加载更多排名</Button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <VerdictStamp :result="verdictResult" @dismiss="verdictResult = null" />
  </div>
</template>

<style lang="scss" scoped>
.hover-row { transition: background .15s; }
.hover-row:hover { background: var(--bew-fill-2); }
/* 比赛排名表:窄屏紧凑 + 用户名省略 + 我的行高亮(置顶与原位) */
.rank-table { font-variant-numeric: tabular-nums; }
.rank-table .rk { padding: 9px 14px; color: var(--bew-text-2); font-weight: 600; white-space: nowrap; }
.rank-table .rk-rank { text-align: center; min-width: 46px; }
.rank-table .rk-prob { text-align: center; padding-left: 5px; padding-right: 5px; }
.rank-table .rk-total { min-width: 58px; }
.rank-table tr.rank-head th { color: var(--bew-text-3); font-size: .82em; letter-spacing: .03em; background: var(--bew-fill-1); }
.rank-table .rk-name { display: inline-block; max-width: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.rank-table tr.rank-mine td { background: var(--bew-theme-color-20); }
/* color-block matrix cell */
.score-block {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 34px; height: 24px; padding: 0 6px;
  border-radius: 6px; font-weight: 700; font-variant-numeric: tabular-nums;
  font-size: .82em; line-height: 1;
}
/* inline-flex wrapper inside td: keeps td a proper table-cell (so columns line
   up with <th>) while laying out avatar+name / medal+rank horizontally. */
.rank-table .rk-inline { display: inline-flex; align-items: center; gap: 6px; vertical-align: middle; }
/* Scoreboard = fixed-height scroll panel (overflow:auto + max-height, set
   inline on .rank-scroll): horizontal scroll returns AND sticky resolves
   against the panel. Header + my-rank pin to the panel top.
   Backgrounds are layered opaque: --bew-bg is solid, --bew-content is
   translucent (glass), so content-over-bg reads as the card colour while
   staying opaque — scrolled rows can't show through. Set on th/td, not tr:
   tr backgrounds don't paint in border-collapse tables. */
.rank-table thead tr.rank-head th { position: sticky; top: 0; z-index: 11; height: 38px; box-sizing: border-box; background-color: var(--bew-bg); background-image: linear-gradient(var(--bew-content), var(--bew-content)); }
.rank-table tr.rank-sticky { position: sticky; top: 38px; z-index: 10; }
/* Opaque pin: var(--bew-bg) is solid (the translucent --bew-content glass sits
   on top via a solid gradient). Set on td — tr backgrounds don't paint in
   border-collapse tables. High z-index stays above body rows. */
.rank-table tr.rank-sticky td { background-color: var(--bew-bg); background-image: linear-gradient(var(--bew-theme-color-20), var(--bew-theme-color-20)), linear-gradient(var(--bew-content), var(--bew-content)); }
@media (max-width: 768px) {
  .rank-table .rk { padding: 6px 7px; }
  .rank-table .rk-name { max-width: 5.5rem; }
  .score-block { min-width: 28px; height: 22px; font-size: .78em; }
}
.markdown-body {
  :deep(h1) { font-size: 1.4em; font-weight: 700; margin: 1em 0 .5em; }
  :deep(h2) { font-size: 1.2em; font-weight: 700; margin: .8em 0 .4em; }
  :deep(h3) { font-size: 1.1em; font-weight: 600; margin: .6em 0 .3em; }
  :deep(p) { margin: .4em 0; }
  :deep(a) { color: var(--bew-theme-color); }
  :deep(ul), :deep(ol) { padding-left: 1.5em; }
  :deep(code) {
    font-family: 'Cascadia Code','Fira Code','JetBrains Mono',monospace;
    background: var(--bew-fill-2); padding: 2px 6px; border-radius: 4px; font-size: .9em;
  }
  :deep(pre) {
    background: var(--code-bg); padding: 12px 16px; border-radius: var(--bew-radius); overflow-x: auto; border: 1px solid var(--bew-border-color);
    :deep(code) { background: none; padding: 0; color: var(--code-text); }
  }
  // hljs token colors — theme-aware (light = GitHub light, dark = One Dark), matches CodeMirror IDE
  :deep(.hljs) { color: var(--code-text); background: none; }
  :deep(.hljs-keyword) { color: var(--code-keyword); }
  :deep(.hljs-string), :deep(.hljs-addition) { color: var(--code-string); }
  :deep(.hljs-number), :deep(.hljs-literal), :deep(.hljs-attr) { color: var(--code-number); }
  :deep(.hljs-comment) { color: var(--code-comment); font-style: italic; }
  :deep(.hljs-function), :deep(.hljs-title) { color: var(--code-func); }
  :deep(.hljs-type), :deep(.hljs-built_in) { color: var(--code-type); }
  :deep(.hljs-meta), :deep(.hljs-variable), :deep(.hljs-name), :deep(.hljs-selector-class), :deep(.hljs-selector-tag) { color: var(--code-meta); }
  :deep(.hljs-params), :deep(.hljs-tag) { color: var(--code-text); }
  :deep(.hljs-deletion) { color: var(--code-meta); }
}

/* Contest meta sidebar: sticky only on lg+ (two-column mode).
   Below lg the layout collapses to a single column. UnoCSS default lg = 1024px. */
@media (min-width: 1024px) {
  .contest-sidebar {
    position: sticky;
    /* sit just below the always-pinned sticky title bar */
    top: calc(var(--bew-top-bar-height) + 56px);
    max-height: calc(100vh - var(--bew-top-bar-height) - 72px);
    overflow-y: auto;
  }
}

.selftest-area {
  width: 100%; background: var(--bew-bg); color: var(--bew-text-1);
  border: 1px solid var(--bew-border-color); border-radius: var(--bew-radius-half);
  padding: 8px 10px; font-family: 'Cascadia Code','Fira Code',monospace;
  font-size: .85em; resize: vertical; outline: none;
  &:focus { border-color: var(--bew-theme-color); }
}
.selftest-output {
  margin: 0; padding: 8px 10px; background: var(--bew-bg); color: var(--bew-text-1);
  border: 1px solid var(--bew-border-color); border-radius: var(--bew-radius-half);
  font-family: 'Cascadia Code','Fira Code',monospace; font-size: .85em;
  white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow: auto;
}
</style>
