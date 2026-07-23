<script setup lang="ts">
import { useGuluApp } from '~/composables/useAppProvider'
import { useMonaco } from '~/composables/useMonaco'
import { AppPage } from '~/enums/appEnums'
import { renderIcon } from '~/utils/icons'
import type { LuoguLanguage } from '~/utils/luogu-api'
import { isLoggedIn as checkLuoguLogin, LUOGU_LANGUAGES, parseErrorLines } from '~/utils/luogu-api'
import { injectKatexCSS } from '~/utils/markdown'
import { useSelfTest } from './composables/useSelfTest'
import SolutionsTab from './components/SolutionsTab.vue'
import DiscussionsTab from './components/DiscussionsTab.vue'
import { useCodePersistence } from './composables/useCodePersistence'
import { useContestMode } from './composables/useContestMode'
import { useProblemSubmit } from './composables/useProblemSubmit'
import { useProblemData } from './composables/useProblemData'
import { useSolutions } from './composables/useSolutions'
import { useSplitView } from './composables/useSplitView'

const props = defineProps<{
  pid?: string
}>()

const { currentUrl, navigateTo } = useGuluApp()

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

// 题解列表(懒加载,切 tab 触发)抽到 useSolutions
const { solutions, solutionsLoading, solutionsNeedLogin, loadSolutions } = useSolutions(problemId)

// Code editor state — declared early to avoid use-before-define with functions below
const selectedLang = ref(LUOGU_LANGUAGES.find(l => l.id === 28) || LUOGU_LANGUAGES[0])
const enableO2 = ref(true)
const codeContent = ref('')

// CodeMirror 6 编辑器宿主(分屏 IDE 视图内挂载/卸载)
const cmHost = ref<HTMLElement>()
const cm = useMonaco({
  host: cmHost,
  value: codeContent,
  lang: computed(() => selectedLang.value.aceMode),
})

// CE/RE 报错定位:从报错文本解析行号 → 编辑器高亮 + 跳转(仅 IDE 编辑器已挂载时生效)
function highlightErrorLines(msg: string | null | undefined) {
  const ls = parseErrorLines(msg)
  if (ls.length) {
    cm.highlightLines(ls)
    cm.jumpToLine(ls[0])
  }
}

// 本地代码草稿(按 pid):存取 + 防抖落盘抽到 useCodePersistence
const { loadLocalCode, flushLocalCode } = useCodePersistence({
  code: codeContent,
  lang: selectedLang,
  problemId,
})

// 题目核心数据(拉取/归一化/派生渲染)抽到 useProblemData;loadRealData 会把草稿写回 codeContent/selectedLang
const { problem, loading, loadError, discussions, difficultyColor, passRate, renderedDescription, renderedHint, loadRealData } = useProblemData({ problemId, codeContent, selectedLang, loadLocalCode })



// ============================================================
// Submission state
// ============================================================
const activeTab = ref<'statement' | 'submit' | 'solutions' | 'discussions'>('statement')
const contestId = computed(() => { const m = (currentUrl.value || window.location.href).match(/[?&]contestId=(\d+)/); return m ? m[1] : '' })
const inContestMode = computed(() => !!contestId.value)
// 默认始终普通题面页;IDE 仅手动按钮进入(不再因 #ide hash 或 contestId 自动进)。
const ideMode = ref(false)
// 窄屏(<768px)下禁用分屏视图:编辑器和题面会挤到无法阅读,移动端直接走 tab 切换。
const isNarrow = ref(false)
if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(max-width: 767px)')
  const sync = () => { isNarrow.value = mq.matches }
  sync()
  // Safari < 14 没有 addEventListener,回落到 addListener
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', sync)
  else if (typeof (mq as any).addListener === 'function') (mq as any).addListener(sync)
  onUnmounted(() => {
    if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', sync)
    else if (typeof (mq as any).removeListener === 'function') (mq as any).removeListener(sync)
  })
}
const isSplitView = computed(() => isLoggedIn.value && ideMode.value && !isNarrow.value)

// 可拖拽分屏比例抽到 useSplitView(自持 onUnmounted 清理)
const { splitRatio, isDragging, startResize } = useSplitView()


// 自测(IDE 运行):逻辑抽到 useSelfTest,这里只解构模板需要的响应式状态 + runTest/resetTest
const {
  testInput, testExpectedOutput, testActualOutput, testRunning, testVerdict, showTestPanel,
  runTest, resetTest,
} = useSelfTest({
  code: codeContent,
  langId: computed(() => selectedLang.value.id),
  enableO2,
  onCompileError: highlightErrorLines,
})

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
  catch (e) { console.warn('[GuluGulu]', e) }
  document.body.removeChild(el)
}
// 竞赛模式:题目列表 + 切换器抽到 useContestMode(setup 时按 contestId 自动拉取/重拉)
const { contestProblems, showProblemSwitcher, showTags, switchToProblem } = useContestMode(contestId)
// 提交态 / 验证码 / 提交历史 / 我的提交记录抽到 useProblemSubmit
const { submitting, submitError, submitResult, submitHistory, captchaSrc, captchaCode, loadCaptcha, handleSubmit, resetSubmit, myRecordsVisible, myRecords, myRecordsLoading, recStatus, toggleMyRecords } = useProblemSubmit({ code: codeContent, isLoggedIn, problemId, inContestMode, contestId, lang: selectedLang, enableO2 })
const copiedMarkdown = ref(false)
const copiedSample = ref<string | null>(null)

function onLangChange(lang: LuoguLanguage) {
  selectedLang.value = lang
}

// 语言下拉用的 {label,value} 选项 + 按 id 切换的 handler(配合自写 Select 组件)
const langOptions = computed(() => LUOGU_LANGUAGES.map(l => ({ label: l.name, value: l.id })))
function onLangIdChange(id: string | number | null) {
  const lang = LUOGU_LANGUAGES.find(l => l.id === id)
  if (lang)
    onLangChange(lang)
}

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


// ============================================================
// Actions
// ============================================================
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
  window.addEventListener('pagehide', flushLocalCode)
})

// Reload data on SPA navigation to a different problem
watch(problemId, (newPid, oldPid) => {
  if (newPid !== oldPid) {
    flushLocalCode() // 在编辑器被新题目覆盖前,先把上一题草稿落盘
    loadError.value = false
    loading.value = true
    resetTest()
    resetSubmit()
    loadRealData()
  }
})

onUnmounted(() => {
  flushLocalCode()
  window.removeEventListener('pagehide', flushLocalCode)
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
        <Transition name="ide-view-fade" mode="out-in">
          <div v-if="!isSplitView" key="normal">

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
                  <span style="display:contents" v-html="renderIcon('mingcute:fire-line', 14)" />
                  {{ problem.difficultyLabel }}
                </span>
              </div>

              <!-- Tags: 收起为开关按钮,点击展开(标签多为数字 id,铺开是噪音) -->
              <div v-if="problem.tags.length > 0" mt-1 flex="~ items-center gap-1.5 wrap">
                <button
                  flex="~ items-center gap-1" text="xs" px-2 py-0.5 rounded-full
                  bg="$bew-fill-2" border="none" cursor-pointer hover="bg-$bew-fill-1"
                  style="color:var(--bew-text-3)"
                  @click="showTags = !showTags"
                >
                  <span style="display:contents" v-html="renderIcon('mingcute:hashtag-line', 10)" />
                  {{ showTags ? '收起' : `标签 (${problem.tags.length})` }}
                  <span style="display:contents" v-html="renderIcon(showTags ? 'mingcute:down-line' : 'mingcute:right-line', 10)" />
                </button>
                <template v-if="showTags">
                  <span
                    v-for="tag in problem.tags" :key="tag.id" text="xs" px-2 py-0.5
                    rounded-full bg="$bew-fill-2" flex="~ items-center gap-1" style="color:var(--bew-text-3)"
                  ><span style="display:contents" v-html="renderIcon('mingcute:hashtag-line', 10)" />{{ tag.name }}</span>
                </template>
              </div>
            </div>

            <div flex="~ gap-2" shrink-0>
              <Button
                v-if="externalUrl"
                type="secondary"
                @click="openOriginalSite"
              >
                <span style="display:contents" v-html="renderIcon('mingcute:external-link-line', 16)" />
                跳转原站
              </Button>
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
          flex="~ gap-1 wrap" mb-4 p-1
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
          <!-- Problem meta (moved from right sidebar) -->
          <div class="hidden md:flex items-center gap-3" px-3 text="xs $bew-text-3" style="margin-left:auto">
            <span flex="~ items-center gap-1"><span style="display:contents" v-html="renderIcon('mingcute:time-line', 14)" />{{ problem.timeLimit }}</span>
            <span flex="~ items-center gap-1"><span style="display:contents" v-html="renderIcon('mingcute:chip-line', 14)" />{{ problem.memoryLimit }}</span>
            <span flex="~ items-center gap-1"><span style="display:contents" v-html="renderIcon('mingcute:chart-bar-line', 14)" />{{ passRate }}%</span>
            <span v-if="problem.provider" flex="~ items-center gap-1" cursor="pointer" @click="openProviderProfile(problem.provider!.uid)">
              <img v-if="problem.provider.avatar" :src="problem.provider.avatar" style="width:16px;height:16px;border-radius:50%" @error="(e:any)=>{e.target.style.display='none'}" />
              <span text="$bew-theme-color">{{ problem.provider.name }}</span>
            </span>
            <button flex="~ items-center gap-1" cursor="pointer" p="x-2.5 y-1" rounded="$bew-radius-half" text="sm" border="none" shrink-0
              style="background:var(--bew-theme-color-20);color:var(--bew-theme-color);font-weight:600"
              @click="toggleMyRecords">
              <span style="display:contents" v-html="renderIcon('mingcute:history-line', 14)" />
              我的提交
            </button>
          </div>
          <button
            v-if="!isSplitView" class="ml-auto" flex="~ items-center gap-1" p="x-3 y-2" rounded="$bew-radius-half" text="sm"
            border="none"
            :disabled="!isLoggedIn"
            :title="isLoggedIn ? '' : '请先登录洛谷后再使用 IDE'"
            :style="{ background:'var(--bew-success-color-20)', color:'var(--bew-success-color)', fontWeight:600, opacity: isLoggedIn ? 1 : 0.5, cursor: isLoggedIn ? 'pointer' : 'not-allowed' }"
            @click="isLoggedIn && (ideMode = true)"
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
          <div grid="~ cols-2 sm:cols-3 md:cols-5" gap-2>
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
        <!-- Statement Tab -->
        <!-- ============================================================ -->
        <Transition v-if="!isSplitView" name="page-fade" mode="out-in">
          <div
            v-if="activeTab === 'statement'"
            key="statement"
            flex="~ col lg:row gap-6"
            items="start"
            bg="$bew-content" rounded="$bew-radius" p="6 md:p-8"
            shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
            border="1 $bew-border-color"
            style="backdrop-filter: var(--bew-filter-glass-1)"
          >
            <!-- Left column: problem statement (description + samples + hint + source) -->
            <div class="problem-statement lg:order-1" flex="1" min-w-0>
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
                      <span v-if="copiedSample === `in-${idx}`" style="display:contents" v-html="renderIcon('mingcute:check-circle-fill', 14)" />
                      <span v-else style="display:contents" v-html="renderIcon('mingcute:copy-line', 14)" />
                      {{ copiedSample === `in-${idx}` ? '已复制' : '复制' }}
                    </button>
                  </div>
                  <pre style="margin:0 0 12px 0"><code>{{ sample.input }}</code></pre>

                  <div class="sample-header" style="border-top: 1px solid var(--bew-border-color)" flex="~ items-center justify-between">
                    <span><span style="display:contents" v-html="renderIcon('mingcute:arrow-left-line', 14)" /> 样例 {{ idx + 1 }} — 输出</span>
                    <button class="sample-copy-btn" :class="{ copied: copiedSample === `out-${idx}` }" @click="copyWithFeedback(`out-${idx}`, sample.output)">
                      <span v-if="copiedSample === `out-${idx}`" style="display:contents" v-html="renderIcon('mingcute:check-circle-fill', 14)" />
                      <span v-else style="display:contents" v-html="renderIcon('mingcute:copy-line', 14)" />
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
                <Select
                  :model-value="selectedLang.id"
                  :options="langOptions"
                  @update:model-value="onLangIdChange"
                />
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

                <Button type="secondary" title="格式化代码(基于括号深度对齐缩进)" @click="cm.formatDocument()">
                  <span style="display:contents" v-html="renderIcon('mingcute:code-line', 16)" />
                  格式化
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
                  <input v-model="captchaCode" placeholder="输入验证码" style="flex:1;padding:6px 10px;background:var(--bew-bg);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:4px;font-size:1.05em;outline:none" @keydown.enter="handleSubmit">
                  <button :disabled="!captchaCode" style="background:var(--bew-theme-color);color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:1.05em;font-weight:600;white-space:nowrap" @click="handleSubmit">
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
                    style="background:var(--bew-theme-color);color:#fff;border:none;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:1em;font-weight:600;white-space:nowrap;flex-shrink:0"
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
                    <span
                      cursor="pointer"
                      @click="navigateTo(AppPage.Record, `https://www.luogu.com.cn/record/${h.rid}`)"
                      style="color:var(--bew-theme-color);font-family:monospace"
                    >
                      #{{ h.rid }}
                    </span>
                    <span style="color:var(--bew-text-3)">{{ h.pid }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ============================================================ -->
          <!-- Discussions Tab -->
          <!-- ============================================================ -->
          <DiscussionsTab v-else-if="activeTab === 'discussions'" key="discussions" :discussions="discussions" />

          <!-- ============================================================ -->
          <!-- Solutions Tab -->
          <!-- ============================================================ -->
          <SolutionsTab v-else-if="activeTab === 'solutions'" key="solutions" :solutions="solutions" :solutions-loading="solutionsLoading" :need-login="solutionsNeedLogin" :problem-id="problemId" />
        </Transition>
          </div>
        <!-- ============================================================ -->
        <!-- Split View (IDE / Contest mode) -->
        <!-- ============================================================ -->
        <div v-else key="ide" flex style="height:calc(100vh - 90px);margin:0 -16px 0 -16px;gap:0">
          <!-- Left: Header + Problem Statement -->
          <div
            class="ide-statement-panel"
            :style="{ flex: `0 0 ${splitRatio}%`, backdropFilter: 'var(--bew-filter-glass-1)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '8px' }" bg="$bew-content" rounded="$bew-radius" p-6 border="1 $bew-border-color"
            shadow="[var(--bew-shadow-1)]"
          >
            <!-- Problem header info -->
            <h1 style="font-size:1.2rem;font-weight:700;color:var(--bew-text-1)">
              <span text="$bew-text-3" font-mono>{{ problem.pid }}</span> {{ problem.title }}
            </h1>
            <div flex="~ gap-2 wrap" style="font-size:.8em;color:var(--bew-text-2)">
              <span v-if="problem.difficultyLabel" flex="~ items-center gap-1" px-2 py-0.5 rounded-full :style="{ backgroundColor: `${difficultyColor}20`, color: difficultyColor }"><span style="display:contents" v-html="renderIcon('mingcute:fire-line', 14)" /> {{ problem.difficultyLabel }}</span>
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
                        <span v-if="copiedSample === `in-${idx}`" style="display:contents" v-html="renderIcon('mingcute:check-circle-fill', 14)" />
                        <span v-else style="display:contents" v-html="renderIcon('mingcute:copy-line', 14)" />
                        {{ copiedSample === `in-${idx}` ? '已复制' : '复制' }}
                      </button>
                    </div>
                    <pre style="margin:0;white-space:pre-wrap;font-size:1.05em;color:var(--bew-text-1);font-family:Consolas,monospace">{{ Array.isArray(sample) ? sample[0] : sample.input }}</pre>
                  </div>
                  <div bg="$bew-fill-1" rounded="$bew-radius" p-3>
                    <div flex="~ items-center justify-between" mb-1>
                      <span text="xs $bew-text-3">输出 #{{ idx + 1 }}</span>
                      <button class="sample-copy-btn" :class="{ copied: copiedSample === `out-${idx}` }" @click="copyWithFeedback(`out-${idx}`, String(Array.isArray(sample) ? sample[1] : sample.output))">
                        <span v-if="copiedSample === `out-${idx}`" style="display:contents" v-html="renderIcon('mingcute:check-circle-fill', 14)" />
                        <span v-else style="display:contents" v-html="renderIcon('mingcute:copy-line', 14)" />
                        {{ copiedSample === `out-${idx}` ? '已复制' : '复制' }}
                      </button>
                    </div>
                    <pre style="margin:0;white-space:pre-wrap;font-size:1.05em;color:var(--bew-text-1);font-family:Consolas,monospace">{{ Array.isArray(sample) ? sample[1] : sample.output }}</pre>
                  </div>
                  <div v-if="(Array.isArray(sample) ? sample[2] : sample.explanation)" mt-1 text="xs" style="color:var(--bew-text-3)">
                    说明: {{ Array.isArray(sample) ? sample[2] : sample.explanation }}
                  </div>
                </div>
              </div>
              <div v-if="problem.hint" class="markdown-body" mt-4 v-html="renderedHint" />
            </div>
            <div style="margin-top:auto;padding-top:12px;border-top:1px solid var(--bew-border-color);display:flex;align-items:center;gap:4px;color:var(--bew-text-4);font-size:.75em">
              <span style="display:contents" v-html="renderIcon('mingcute:check-line', 14)" />
              题目正文结束
            </div>
          </div>

          <!-- Resize Handle -->
          <div :style="{ flex: '0 0 3px', cursor: 'col-resize', background: isDragging ? 'var(--bew-theme-color)' : 'transparent', transition: isDragging ? 'none' : 'background var(--bew-dur-fast)', userSelect: 'none', margin: '0 1px', position: 'relative' }" class="resize-handle" @mousedown="startResize">
            <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--bew-text-4);pointer-events:none;line-height:0" v-html="renderIcon('mingcute:transfer-line', 10)" />
          </div>

          <!-- Right: Code Editor + Controls -->
          <div class="ide-editor-panel" :style="{ flex: `0 0 ${100 - splitRatio - 0.5}%`, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }">
            <!-- Editor Card -->
            <div bg="$bew-content" rounded="$bew-radius" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1);display:flex;flex-direction:column;flex:1;min-height:0">
              <!-- Top bar: all controls -->
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;padding:5px 10px;border-bottom:1px solid var(--bew-border-color);font-size:1em;overflow-x:auto">
                <div v-if="contestProblems.length > 0" style="display:flex;align-items:center;gap:3px">
                  <span v-for="cp in contestProblems" :key="cp.no" style="padding:0 6px;border-radius:999px;cursor:pointer;font-size:0.9em;font-weight:600;white-space:nowrap" :style="{ background: cp.pid === problemId ? 'var(--bew-theme-color)' : 'var(--bew-fill-2)', color: cp.pid === problemId ? '#fff' : 'var(--bew-text-2)' }" @click="switchToProblem(cp.pid)">{{ cp.no }}</span>
                </div>
                <Select
                  :model-value="selectedLang.id"
                  :options="langOptions"
                  style="width:150px;flex-shrink:0"
                  @update:model-value="onLangIdChange"
                />
                <label v-if="selectedLang.canO2" style="display:flex;align-items:center;gap:3px;color:var(--bew-text-2);cursor:pointer;white-space:nowrap;font-size:1.05em">
                  <input v-model="enableO2" type="checkbox" style="width:13px;height:13px;cursor:pointer"> O2
                </label>
                <span style="flex:1" />
                <button style="display:flex;align-items:center;gap:4px;background:none;border:1px solid var(--bew-border-color);border-radius:var(--bew-radius-half);padding:4px 10px;cursor:pointer;color:var(--bew-text-2);font-size:1em;white-space:nowrap" @click="copyMarkdown">
                  <span style="display:contents" v-html="renderIcon(copiedMarkdown ? 'mingcute:check-circle-fill' : 'mingcute:copy-line', 14)" />
                  {{ copiedMarkdown ? '已复制' : '复制MD' }}
                </button>
                <button style="display:flex;align-items:center;gap:4px;background:none;border:1px solid var(--bew-border-color);border-radius:var(--bew-radius-half);padding:4px 10px;cursor:pointer;color:var(--bew-text-2);font-size:1em;white-space:nowrap" @click="showTestPanel = !showTestPanel">
                  <span style="display:contents" v-html="renderIcon(showTestPanel ? 'mingcute:down-line' : 'mingcute:right-line', 14)" />
                  自测
                </button>
                <button style="display:flex;align-items:center;gap:4px;background:none;border:1px solid var(--bew-border-color);border-radius:var(--bew-radius-half);padding:4px 10px;cursor:pointer;color:var(--bew-text-2);font-size:1em;white-space:nowrap" title="格式化代码(基于括号深度对齐缩进)" @click="cm.formatDocument()">
                  <span style="display:contents" v-html="renderIcon('mingcute:code-line', 14)" />
                  格式化
                </button>
                <button style="display:flex;align-items:center;gap:4px;background:none;border:1px solid var(--bew-border-color);border-radius:var(--bew-radius-half);padding:4px 10px;cursor:pointer;color:var(--bew-text-2);font-size:1em;white-space:nowrap" @click="ideMode = false">
                  <span style="display:contents" v-html="renderIcon('mingcute:exit-line', 14)" />
                  退出
                </button>
                <button class="btn-press" :disabled="submitting" style="display:flex;align-items:center;gap:4px;background:var(--bew-theme-color);color:#fff;border:none;border-radius:var(--bew-radius-half);padding:3px 12px;cursor:pointer;font-size:1.05em;font-weight:600;white-space:nowrap" @click="handleSubmit">
                  <span style="display:contents" v-html="renderIcon('mingcute:send-line', 14)" />
                  {{ submitting ? '…' : '提交' }}
                </button>
              </div>
              <div style="flex:1;position:relative;overflow:hidden;border-bottom-left-radius:var(--bew-radius);border-bottom-right-radius:var(--bew-radius)">
                <div ref="cmHost" style="position:absolute;inset:0;overflow:hidden" />
              </div>
            </div>

            <!-- Submit feedback (IDE/contest split view — was missing: result/captcha/error) -->
            <div v-if="submitResult || submitError || captchaSrc" style="flex-shrink:0;display:flex;flex-direction:column;gap:6px;margin-top:6px;padding:8px 10px;background:var(--bew-content);border:1px solid var(--bew-border-color);border-radius:var(--bew-radius);font-size:1em">
              <div v-if="submitResult" style="color:var(--bew-success-color);font-weight:600">
                {{ submitResult }}
              </div>
              <div v-if="captchaSrc" style="display:flex;flex-direction:column;gap:6px">
                <img :src="captchaSrc" style="max-width:180px;border-radius:4px" alt="验证码">
                <div style="display:flex;align-items:center;gap:6px">
                  <input v-model="captchaCode" placeholder="输入验证码" style="flex:1;padding:5px 8px;background:var(--bew-fill-1);color:var(--bew-text-1);border:1px solid var(--bew-border-color);border-radius:var(--bew-radius-half);font-size:1.05em;outline:none" @keydown.enter="handleSubmit">
                  <button class="btn-press" :disabled="!captchaCode" style="background:var(--bew-theme-color);color:#fff;border:none;border-radius:var(--bew-radius-half);padding:5px 10px;cursor:pointer;font-weight:600;white-space:nowrap" @click="handleSubmit">
                    提交
                  </button>
                </div>
                <button style="background:none;border:none;color:var(--bew-text-3);cursor:pointer;font-size:.75em;align-self:flex-start" @click="captchaSrc = ''; captchaCode = ''; submitError = ''">
                  取消
                </button>
              </div>
              <div v-if="submitError" style="display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--bew-error-color)">
                <span>{{ submitError }}</span>
                <button v-if="submitError.includes('验证码')" style="background:var(--bew-theme-color);color:#fff;border:none;border-radius:var(--bew-radius-half);padding:3px 8px;cursor:pointer;font-size:1em;font-weight:600;white-space:nowrap;flex-shrink:0" @click="loadCaptcha()">
                  刷新验证码
                </button>
              </div>
            </div>

            <!-- Test Panels: grid 0fr↔1fr 折叠,高度动画,上方编辑器随之伸缩 -->
            <div class="test-panel-collapse" :class="{ 'is-open': showTestPanel }">
              <div class="test-panel-collapse-inner">
            <div style="display:flex;gap:6px;min-height:120px">
              <div bg="$bew-content" rounded="$bew-radius" style="backdrop-filter:var(--bew-filter-glass-1);display:flex;flex-direction:column;flex:1;overflow:hidden;border:1px solid var(--bew-border-color)">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px 2px;font-size:.75em;color:var(--bew-text-3);border-bottom:1px solid var(--bew-border-color)">
                  <span>自测输入</span>
                  <span flex="~ items-center gap-1">
                    <span v-if="testVerdict" style="padding:0 6px;border-radius:999px;font-size:.75em;font-weight:700;line-height:1.5" :style="{ background: testVerdict.startsWith('AC') || testVerdict.startsWith('运行完成') ? 'var(--bew-success-color-20)' : 'var(--bew-error-color-20)', color: testVerdict.startsWith('AC') || testVerdict.startsWith('运行完成') ? 'var(--bew-success-color)' : 'var(--bew-error-color)' }">{{ testVerdict }}</span>
                    <button :disabled="testRunning" style="display:flex;align-items:center;gap:4px;background:var(--bew-theme-color);color:#fff;border:none;border-radius:var(--bew-radius-half);padding:4px 10px;cursor:pointer;font-size:1em;font-weight:600;white-space:nowrap" @click="runTest">
                      <span style="display:contents" v-html="renderIcon('mingcute:play-fill', 14)" />
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
          </div>
        </div>
        </Transition>
      </div>
    </Transition>
    <Dialog v-if="myRecordsVisible" v-model:visible="myRecordsVisible" title="我的提交记录 · 本题" :show-footer="false" append-to-body :width="520">
      <div v-if="myRecordsLoading" py-4 text="center $bew-text-3">
        加载中…
      </div>
      <div v-else-if="!myRecords.length" py-4 text="center $bew-text-3">
        暂无提交记录
      </div>
      <div v-else>
        <div
          v-for="r in myRecords" :key="r.id"
          flex="~ items-center justify-between" py-2 cursor="pointer"
          style="border-bottom:1px solid var(--bew-border-color)"
          @click="navigateTo(AppPage.Record, `https://www.luogu.com.cn/record/${r.id}`)"
        >
          <span flex="~ items-center gap-2">
            <span fw-bold :style="{ color: recStatus(r.status).color, minWidth: '36px' }">{{ recStatus(r.status).label }}</span>
            <span text="xs $bew-text-2">#{{ r.id }}</span>
          </span>
          <span flex="~ items-center gap-3" text="xs $bew-text-3">
            <span v-if="r.score != null">{{ r.score }}分</span>
            <span v-if="r.time != null">{{ r.time }}ms</span>
            <span>{{ new Date((r.submitTime || 0) * 1000).toLocaleString() }}</span>
          </span>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style lang="scss">
@import "~/styles/problemContent.scss";
</style>

<style lang="scss" scoped>
.resize-handle:hover {
  background: var(--bew-fill-2) !important;
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
  transition: all var(--bew-dur-fast);
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

/* (problem-sidebar right column removed — meta moved to the tab bar) */
</style>
