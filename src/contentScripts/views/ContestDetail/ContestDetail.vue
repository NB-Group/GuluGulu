<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { getCsrfToken, LUOGU_LANGUAGES, friendlyError } from '~/utils/luogu-api'
import { parseMarkdownContent } from '~/utils/markdown'
import { useGulyApp } from '~/composables/useAppProvider'

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
  score: number; scores: (number | null)[]; totalTime?: number
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
const lang = ref(3)
const enableO2 = ref(false)
const submitLoading = ref(false)
const submitResult = ref<any>(null)
const submitError = ref('')

// Problem statement
const problemStatement = ref<any>(null)
const statementLoading = ref(false)

// Ranking
const scoreboard = ref<ScoreboardRow[]>([])
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
async function handleSubmit() {
  if (!selectedPid.value) { submitError.value = '请先选择题目'; return }
  if (!code.value.trim()) { submitError.value = '请先输入代码'; return }
  submitLoading.value = true; submitError.value = ''; submitResult.value = null
  try {
    const csrf = getCsrfToken()
    const res = await fetch(`https://www.luogu.com.cn/fe/api/contest/submit/${contestId.value}/${selectedPid.value}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
      body: JSON.stringify({ code: code.value, lang: lang.value, enableO2: enableO2.value ? 1 : 0 }),
    })
    const json = await res.json()
    if (json?.code === 200) {
      submitResult.value = { success: true, rid: json.rid || json.data?.rid }
    } else {
      submitError.value = json?.data || json?.msg || '提交失败'
    }
  } catch (e: any) { submitError.value = '提交失败：' + (e.message || '网络错误') }
  submitLoading.value = false
}

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
      scoreboard.value = data.scoreboard.result.map((r: any) => ({
        rank: r.rank || r.idx,
        user: { uid: r.user?.uid || r.uid, name: r.user?.name || r.name || '', avatar: r.user?.avatar || `https://cdn.luogu.com.cn/upload/usericon/${r.user?.uid || r.uid}.png`, color: r.user?.color || r.color || '' },
        score: r.score || r.totalScore || 0,
        scores: r.scores || r.problemScores || [],
        totalTime: r.totalTime || r.time || 0,
      }))
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
const nowTimer = setInterval(() => { nowTs.value = Math.floor(Date.now() / 1000) }, 1000)
onUnmounted(() => clearInterval(nowTimer))

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

function openUser(uid: number) { window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank') }
function openOriginal() { window.open(`https://www.luogu.com.cn/contest/${contestId.value}`, '_blank') }
function openRecord(rid: number) { window.open(`https://www.luogu.com.cn/record/${rid}`, '_blank') }

onMounted(() => { fetchContestData() })
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
      <div v-if="!loading && contest" w-full>
        <!-- ============================================================ -->
        <!-- Header -->
        <!-- ============================================================ -->
        <div bg="$bew-content" rounded="$bew-radius" p-6 mb-4 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <div flex="~ col gap-4">
            <div flex="~ items-center gap-2" flex-wrap>
              <span text="xs" fw-bold px-3 py-1 rounded-full :style="{ background: contestStatus.color + '20', color: contestStatus.color }">{{ contestStatus.label }}</span>
              <span text="xs" fw-bold px-3 py-1 rounded-full bg="$bew-theme-color-20" style="color:var(--bew-theme-color)">{{ c.ruleType || c.type || 'OI' }}</span>
              <span v-if="c.rated" text="xs" fw-bold px-3 py-1 rounded-full style="background:var(--bew-warning-color-20);color:var(--bew-warning-color)">Rated</span>
              <template v-if="countdown()"><span text="xs" fw-bold px-3 py-1 rounded-full style="background:var(--bew-error-color-20);color:var(--bew-error-color)">{{ countdown() }}</span></template>
            </div>
            <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:700">{{ c.name }}</h1>
            <div v-if="c.host" style="font-size:var(--bew-base-font-size);color:var(--bew-text-2)" flex="~ items-center gap-2" mb-1>
              <span style="font-size:.85em">主办:</span>
              <img :src="c.host.avatar" style="width:20px;height:20px;border-radius:50%" @error="(e:any) => e.target.style.display='none'" />
              <span :style="{color:`var(--bew-${c.host.color})`,fontWeight:500}">{{ c.host.name }}</span>
            </div>
            <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-2)" flex="~ items-center gap-2">
              <span v-html="renderIcon('mingcute:time-line', 16)" style="display:contents" />
              {{ timeRange }} ({{ duration }})
            </div>
            <div v-if="c.description" style="font-size:var(--bew-base-font-size);color:var(--bew-text-2);line-height:1.6;white-space:pre-wrap" mt-2>{{ c.description }}</div>
            <div v-if="registeredCount > 0" style="font-size:var(--bew-base-font-size);color:var(--bew-text-3)">{{ registeredCount }} 人已报名</div>
            <!-- Registration button -->
            <div v-if="!contestStatus.ended" flex="~ items-center gap-3">
              <Button v-if="!isRegistered" type="primary" :loading="regLoading" @click="handleRegister">
                <span v-html="renderIcon('mingcute:user-add-line', 16)" style="display:contents" /> 报名参赛
              </Button>
              <span v-else px-3 py-1 rounded-full style="font-size:var(--bew-base-font-size);background:var(--bew-success-color-20);color:var(--bew-success-color);font-weight:600">已报名</span>
              <span v-if="regMsg" style="font-size:var(--bew-base-font-size);color:var(--bew-success-color)">{{ regMsg }}</span>
            </div>
            <div v-if="contestStatus.ended" style="font-size:var(--bew-base-font-size);color:var(--bew-text-3)">比赛已结束</div>
            <div v-if="!canAccessContent && isRegistered" mt-2 p-3 rounded="$bew-radius" style="background:var(--bew-warning-color-20);color:var(--bew-warning-color);font-size:var(--bew-base-font-size)">比赛尚未开始，开始后可查看题目与提交</div>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- Tab Bar -->
        <!-- ============================================================ -->
        <div bg="$bew-content" rounded="$bew-radius" mb-4 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden">
          <div flex="~" border="b-1 $bew-border-color">
            <template v-for="tab in (['overview','problems','submit','ranking'] as const)" :key="tab">
              <button v-if="tab==='overview' || canAccessContent" flex="1" style="background:none;border:none;cursor:pointer;padding:12px 16px;font-size:var(--bew-base-font-size);font-weight:600;transition:all .2s" :style="{ color: activeTab === tab ? 'var(--bew-theme-color)' : 'var(--bew-text-3)', borderBottom: activeTab === tab ? '2px solid var(--bew-theme-color)' : '2px solid transparent' }" @click="activeTab = tab">
              {{ { overview: '概览', problems: '题目', submit: '提交', ranking: '排名' }[tab] }}
              </button>
            </template>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- Tab: Overview -->
        <!-- ============================================================ -->
        <div v-if="activeTab === 'overview'" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <div v-if="c.description" class="markdown-body" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);line-height:1.8" v-html="parseMarkdownContent(c.description)" />
          <div v-else style="text-align:center;padding:40px;color:var(--bew-text-3);font-size:var(--bew-base-font-size)">
            <span v-html="renderIcon('mingcute:info-line', 48)" style="display:contents" /><p mt-2>暂无比赛介绍</p>
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
              <div v-if="p.submitted != null && p.submitted >= 0" style="font-size:.8em;color:var(--bew-text-3)">通过 {{ p.accepted }} / 提交 {{ p.submitted }}</div>
            </div>
            <span style="font-size:var(--bew-base-font-size);color:var(--bew-theme-color);font-weight:600;flex-shrink:0">{{ p.score }} 分</span>
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

            <!-- Language & O2 -->
            <div flex="~ items-center gap-3" mb-3>
              <select v-model="lang" style="padding:6px 10px;background:var(--bew-fill-1);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:var(--bew-radius);font-size:var(--bew-base-font-size)">
                <option v-for="l in LUOGU_LANGUAGES.slice(0, 12)" :key="l.id" :value="l.id">{{ l.name }}</option>
              </select>
              <label flex="~ items-center gap-1" style="font-size:var(--bew-base-font-size);color:var(--bew-text-2);cursor:pointer">
                <input type="checkbox" v-model="enableO2" /> O2优化
              </label>
            </div>

            <!-- Code editor -->
            <textarea v-model="code" style="width:100%;height:300px;background:var(--bew-fill-1);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:var(--bew-radius);padding:12px;font-family:'Cascadia Code','Fira Code',monospace;font-size:var(--bew-base-font-size);resize:vertical;tab-size:4" placeholder="在此输入代码..." spellcheck="false" />

            <!-- Submit button -->
            <div v-if="submitError" mt-3 p-3 rounded="$bew-radius" style="background:var(--bew-error-color-20);color:var(--bew-error-color);font-size:var(--bew-base-font-size)">{{ submitError }}</div>
            <div v-if="submitResult?.success" mt-3 p-3 rounded="$bew-radius" style="background:var(--bew-success-color-20);color:var(--bew-success-color);font-size:var(--bew-base-font-size)">
              提交成功！
              <span v-if="submitResult.rid" style="color:var(--bew-theme-color);cursor:pointer;font-weight:600" @click="openRecord(submitResult.rid)">查看记录 #{{ submitResult.rid }}</span>
            </div>
            <Button type="primary" mt-3 w-full :loading="submitLoading" @click="handleSubmit" :disabled="!selectedPid">
              <span v-html="renderIcon('mingcute:send-line', 16)" style="display:contents" /> 提交代码
            </Button>
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
          <!-- Scoreboard table -->
          <div v-if="scoreboard.length > 0" overflow="auto">
            <table style="width:100%;border-collapse:collapse;font-size:var(--bew-base-font-size)">
              <thead>
                <tr bg="$bew-fill-1" text="left">
                  <th px-4 py-3 style="color:var(--bew-text-2);font-weight:600">#</th>
                  <th px-4 py-3 style="color:var(--bew-text-2);font-weight:600">选手</th>
                  <th v-for="(_p, pi) in problems" :key="pi" px-4 py-3 text="center" style="color:var(--bew-text-2);font-weight:600">{{ problemLabel(pi) }}</th>
                  <th px-4 py-3 text="right" style="color:var(--bew-text-2);font-weight:600">总分</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in scoreboard" :key="row.rank" class="stagger-row" :style="{ '--row-index': idx }" border="b-1 $bew-border-color" duration-150 cursor="pointer" @click="openUser(row.user.uid)">
                  <td px-4 py-3 fw-bold :style="{ color: row.rank <= 3 ? 'var(--bew-warning-color)' : 'var(--bew-text-1)' }">{{ row.rank }}</td>
                  <td px-4 py-3 flex="~ items-center gap-2">
                    <img :src="row.user.avatar" style="width:24px;height:24px;border-radius:50%;object-fit:cover" @error="(e:any) => e.target.style.display='none'" />
                    <span :style="{ color: row.user.color ? `var(--bew-${row.user.color})` : 'var(--bew-text-1)', fontWeight: 600 }">{{ row.user.name }}</span>
                  </td>
                  <td v-for="(s, si) in row.scores" :key="si" px-4 py-3 text="center" fw-bold :style="{ color: s != null && s >= (problems[si]?.score||100) ? 'var(--bew-success-color)' : s != null ? 'var(--bew-error-color)' : 'var(--bew-text-4)' }">
                    {{ s != null ? s : '-' }}
                  </td>
                  <td px-4 py-3 text="right" fw-bold style="color:var(--bew-text-1)">{{ row.score }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="rankingTotal > scoreboard.length" p-4 text="center">
            <Button type="secondary" @click="rankingPage++;fetchScoreboard(rankingPage)">加载更多排名</Button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.hover-row { transition: background .15s; }
.hover-row:hover { background: var(--bew-fill-2); }
.markdown-body {
  :deep(h1) { font-size: 1.4em; font-weight: 700; margin: 1em 0 .5em; }
  :deep(h2) { font-size: 1.2em; font-weight: 700; margin: .8em 0 .4em; }
  :deep(h3) { font-size: 1.1em; font-weight: 600; margin: .6em 0 .3em; }
  :deep(p) { margin: .4em 0; }
  :deep(a) { color: var(--bew-theme-color); }
  :deep(ul), :deep(ol) { padding-left: 1.5em; }
}
</style>
