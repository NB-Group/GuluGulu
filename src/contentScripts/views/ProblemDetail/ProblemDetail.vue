<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'
import { parseProblemMarkdown } from '~/utils/markdown'
import { submitCode, extractProblemData, LUOGU_LANGUAGES, isLoggedIn as checkLuoguLogin } from '~/utils/luogu-api'
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'

const { navigateTo } = useGulyApp()

const props = defineProps<{
  pid?: string
}>()

// ============================================================
// Problem ID — from URL or props
// ============================================================
function extractPidFromUrl(): string {
  const match = document.URL.match(/\/problem\/([A-Z]?\d+)/i)
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
  tags: Array<{ id: number; name: string }>
  totalSubmit: number
  totalAccepted: number
  background: string
  description: string
  inputFormat: string
  outputFormat: string
  hint: string
  source: string
  samples: Array<{ input: string; output: string; explanation?: string }>
  provider: { uid: number; name: string; avatar: string; color: string } | null
}

const difficultyMap: Record<number, { label: string; color: string }> = {
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
const discussions = ref<Array<{ id: number; title: string; author: any; time: number; replyCount: number }>>([])

function loadRealData() {
  try {
    const raw = extractProblemData()
    if (!raw?.data?.problem) {
      // No real data on page, keep mock
      setTimeout(() => { loading.value = false }, 400)
      return
    }

    const p = raw.data.problem
    const limits = p.limits || {}
    const timeMs = limits.time?.[0] || 1000
    const memKb = limits.memory?.[0] || 125000

    // Parse samples
    const samples: ProblemData['samples'] = []
    if (Array.isArray(p.samples)) {
      for (const s of p.samples) {
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
    const discList = raw?.data?.discussions
    if (Array.isArray(discList)) {
      discussions.value = discList.map((d: any) => ({
        id: d.id || 0, title: d.title || '', author: d.author || {},
        time: d.time || 0, replyCount: d.replyCount || d.reply_count || 0,
      }))
    }

    document.title = `${problem.value.pid} ${problem.value.title} - GuluGulu`
    loading.value = false
  }
  catch (e) {
    console.error('[GulyGuly] Failed to load problem data:', e)
    loadError.value = true
    loading.value = false
  }
}

// ============================================================
// Submission state
// ============================================================
const activeTab = ref<'statement' | 'submit' | 'solutions' | 'discussions'>('statement')
const submitted = ref(false)
const submitting = ref(false)
const submitError = ref('')
const submitResult = ref('')
const lastRid = ref<number | null>(null)

// Code editor state
const selectedLang = ref(LUOGU_LANGUAGES.find(l => l.id === 28) || LUOGU_LANGUAGES[0]) // Default C++14 (GCC 9)
const enableO2 = ref(true)
const codeContent = ref('')

// Default code templates per language
function getDefaultCode(lang: number): string {
  const templates: Record<number, string> = {
    2: '#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n',
    3: '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
    4: '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
    28: '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
    11: '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
    12: '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
    7: 'import sys\n\ndef main():\n    pass\n\nif __name__ == \'__main__\':\n    main()\n',
    25: 'import sys\n\ndef main():\n    pass\n\nif __name__ == \'__main__\':\n    main()\n',
    8: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        \n    }\n}\n',
    9: "const readline = require('readline');\n\nconst rl = readline.createInterface({\n    input: process.stdin,\n    output: process.stdout\n});\n\nrl.on('line', (line) => {\n    \n});\n",
    15: 'use std::io;\n\nfn main() {\n    \n}\n',
  }
  return templates[lang] || ''
}

function onLangChange(lang: LuoguLanguage) {
  selectedLang.value = lang
  if (!codeContent.value) {
    codeContent.value = getDefaultCode(lang.id)
  }
}

getDefaultCode(28) // Init with C++ template

// ============================================================
// Computed
// ============================================================
const tabs = computed(() => [
  { key: 'statement' as const, label: '题目描述', icon: 'mingcute:document-line' },
  { key: 'submit' as const, label: '提交代码', icon: 'mingcute:code-line' },
  { key: 'solutions' as const, label: '题解', icon: 'mingcute:bulb-line' },
  { key: 'discussions' as const, label: '讨论', icon: 'mingcute:comment-line' },
])

const difficultyColor = computed(() => difficultyMap[problem.value.difficulty]?.color || '#909399')

const passRate = computed(() => {
  if (problem.value.totalSubmit === 0) return 0
  return Math.round((problem.value.totalAccepted / problem.value.totalSubmit) * 100)
})

const renderedDescription = computed(() => {
  const parts: string[] = []
  if (problem.value.background) parts.push(problem.value.background)
  parts.push(problem.value.description)
  if (problem.value.inputFormat) parts.push(`## 输入格式\n\n${problem.value.inputFormat}`)
  if (problem.value.outputFormat) parts.push(`## 输出格式\n\n${problem.value.outputFormat}`)
  return parseProblemMarkdown(parts.join('\n\n'))
})

const renderedHint = computed(() => parseProblemMarkdown(problem.value.hint))

const isLoggedIn = computed(() => checkLuoguLogin())

// ============================================================
// Actions
// ============================================================
async function handleSubmit() {
  if (!codeContent.value.trim()) {
    submitError.value = '请输入代码'
    return
  }
  if (!isLoggedIn.value) {
    submitError.value = '请先登录洛谷'
    return
  }

  submitting.value = true
  submitError.value = ''
  submitResult.value = ''

  const result = await submitCode({
    pid: problemId.value,
    code: codeContent.value,
    lang: selectedLang.value.id,
    enableO2: enableO2.value && selectedLang.value.canO2,
  })

  submitting.value = false

  if (result.status === 200 && result.rid) {
    submitted.value = true
    lastRid.value = result.rid
    submitResult.value = `提交成功！评测记录 #${result.rid}`
    window.open(`https://www.luogu.com.cn/record/${result.rid}`, '_blank')
  }
  else if (result.needCaptcha) {
    submitError.value = ''
    // Open a verification popup — user completes Turnstile there, then re-submits here
    const w = 400; const h = 500
    const left = (screen.width - w) / 2; const top = (screen.height - h) / 2
    window.open(`https://www.luogu.com.cn/problem/${problemId.value}`, 'luogu-verify', `width=${w},height=${h},left=${left},top=${top}`)
    submitError.value = '请在弹出的验证窗口中完成人机验证，然后返回此页面重新提交。'
  }
  else if (result.status === 403) {
    submitError.value = result.errorMessage || '请先登录洛谷后再提交'
  }
  else {
    submitError.value = result.errorMessage || `提交失败 (HTTP ${result.status})`
  }
}

function copyText(text: string) { navigator.clipboard.writeText(text) }

const copiedMarkdown = ref(false)
const copiedSample = ref<string | null>(null)

function copyWithFeedback(key: string, text: string) {
  navigator.clipboard.writeText(text)
  copiedSample.value = key
  setTimeout(() => { if (copiedSample.value === key) copiedSample.value = null }, 1500)
}

function buildProblemMarkdown(): string {
  const p = problem.value
  const lines: string[] = []
  lines.push(`# ${p.pid} ${p.title}\n`)
  if (p.background) lines.push(`${p.background}\n`)
  lines.push(p.description)
  if (p.inputFormat) lines.push(`## 输入格式\n\n${p.inputFormat}`)
  if (p.outputFormat) lines.push(`## 输出格式\n\n${p.outputFormat}`)
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
      if (s.explanation) lines.push(`${s.explanation}\n`)
    })
  }
  if (p.hint) lines.push(`## 提示\n\n${p.hint}`)
  if (p.source) lines.push(`\n来源：${p.source}`)
  return lines.join('\n\n')
}

async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(buildProblemMarkdown())
    copiedMarkdown.value = true
    setTimeout(() => { copiedMarkdown.value = false }, 2000)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = buildProblemMarkdown()
    ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(ta)
    copiedMarkdown.value = true
    setTimeout(() => { copiedMarkdown.value = false }, 2000)
  }
}
function openLuoguIDE() {
  // Open Luogu's own IDE for code submission (handles Cloudflare/captcha natively)
  window.open(`https://www.luogu.com.cn/problem/${problemId.value}#submit`, '_blank')
}

function openOriginalPage() {
  window.open(`https://www.luogu.com.cn/problem/${problemId.value}`, '_blank')
}

function openSolutionsPage() {
  navigateTo(AppPage.Solution, `https://www.luogu.com.cn/problem/solution/${problemId.value}`)
}
function openProviderProfile(uid: number) {
  window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank')
}

function handleTabChange(tab: typeof activeTab.value) {
  activeTab.value = tab
  submitError.value = ''
}

// ============================================================
// Lifecycle
// ============================================================
onMounted(() => {
  loadRealData()
})
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <Loading v-if="loading" />

    <Transition name="content-reveal">
      <div v-if="!loading" w-full>
        <!-- ============================================================ -->
        <!-- Problem Header -->
        <!-- ============================================================ -->
        <div
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
                  :style="{ backgroundColor: `${difficultyColor}20`, color: difficultyColor }"
                >
                  {{ problem.difficultyLabel }}
                </span>
              </div>

              <div flex="~ gap-4 wrap" text="sm $bew-text-2">
                <span flex="~ items-center gap-1">
                  <span v-html="renderIcon('mingcute:time-line', 16)" style="display:contents" />
                  <span>{{ problem.timeLimit }}</span>
                </span>
                <span flex="~ items-center gap-1">
                  <span v-html="renderIcon('mingcute:chip-line', 16)" style="display:contents" />
                  <span>{{ problem.memoryLimit }}</span>
                </span>
                <span flex="~ items-center gap-1">
                  <span v-html="renderIcon('mingcute:chart-bar-line', 16)" style="display:contents" />
                  <span>通过 {{ problem.totalAccepted.toLocaleString() }} / {{ problem.totalSubmit.toLocaleString() }} ({{ passRate }}%)</span>
                </span>
              </div>

              <div v-if="problem.provider" flex="~ items-center gap-2" mt-1>
                <span text="xs $bew-text-3">提供者：</span>
                <span text="sm $bew-theme-color" fw-bold cursor-pointer
                  @click="openProviderProfile(problem.provider!.uid)"
                >{{ problem.provider.name }}</span>
              </div>
            </div>

            <div flex="~ gap-2" shrink-0>
              <Button
                :type="copiedMarkdown ? 'success' : 'secondary'"
                @click="copyMarkdown"
              >
                <span v-html="renderIcon(copiedMarkdown ? 'mingcute:check-circle-fill' : 'mingcute:copy-line', 16)" style="display:contents" />
                {{ copiedMarkdown ? '已复制' : '复制 Markdown' }}
              </Button>
              <Button type="primary" @click="handleTabChange('submit')">
                <span v-html="renderIcon('mingcute:code-line', 16)" style="display:contents" />
                提交代码
              </Button>
            </div>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- Tab Bar -->
        <!-- ============================================================ -->
        <div
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
            <span v-html="renderIcon(tab.icon, 16)" style="display:contents" />
            {{ tab.label }}
          </button>
        </div>

        <!-- ============================================================ -->
        <!-- Statement Tab -->
        <!-- ============================================================ -->
        <Transition name="page-fade" mode="out-in">
          <div
            v-if="activeTab === 'statement'"
            :key="'statement'"
            bg="$bew-content" rounded="$bew-radius" p="6 md:p-8"
          shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
          border="1 $bew-border-color"
          style="backdrop-filter: var(--bew-filter-glass-1)"
        >
          <div class="problem-statement">
            <!-- Background -->
            <div v-if="problem.background" mb-6>
              <blockquote v-html="renderedDescription.split(problem.description)[0]" />
            </div>

            <!-- Main description -->
            <div v-html="renderedDescription" mb-6 />

            <!-- Sample I/O -->
            <div v-if="problem.samples.length > 0" mt-8>
              <h2 mb-4>样例</h2>
              <div v-for="(sample, idx) in problem.samples" :key="idx" class="sample-io" mb-4>
                <div class="sample-header" flex="~ items-center justify-between">
                  <span><span v-html="renderIcon('mingcute:arrow-right-line', 14)" style="display:contents" /> 样例 {{ idx + 1 }} — 输入</span>
                  <button class="sample-copy-btn" :class="{ copied: copiedSample === `in-${idx}` }" @click="copyWithFeedback(`in-${idx}`, sample.input)">
                    <span v-if="copiedSample === `in-${idx}`" v-html="renderIcon('mingcute:check-circle-fill', 12)" style="display:contents" />
                    <span v-else v-html="renderIcon('mingcute:copy-line', 12)" style="display:contents" />
                    {{ copiedSample === `in-${idx}` ? '已复制' : '复制' }}
                  </button>
                </div>
                <pre style="margin:0 0 12px 0"><code>{{ sample.input }}</code></pre>

                <div class="sample-header" style="border-top: 1px solid var(--bew-border-color)" flex="~ items-center justify-between">
                  <span><span v-html="renderIcon('mingcute:arrow-left-line', 14)" style="display:contents" /> 样例 {{ idx + 1 }} — 输出</span>
                  <button class="sample-copy-btn" :class="{ copied: copiedSample === `out-${idx}` }" @click="copyWithFeedback(`out-${idx}`, sample.output)">
                    <span v-if="copiedSample === `out-${idx}`" v-html="renderIcon('mingcute:check-circle-fill', 12)" style="display:contents" />
                    <span v-else v-html="renderIcon('mingcute:copy-line', 12)" style="display:contents" />
                    {{ copiedSample === `out-${idx}` ? '已复制' : '复制' }}
                  </button>
                </div>
                <pre style="margin:0 0 12px 0"><code>{{ sample.output }}</code></pre>

                <div v-if="sample.explanation" class="sample-header" style="border-top: 1px solid var(--bew-border-color);">
                  <span v-html="renderIcon('mingcute:bulb-line', 14)" style="display:contents" />
                  样例 {{ idx + 1 }} — 说明
                </div>
                <div v-if="sample.explanation" p="x-4 y-3" bg="$bew-fill-1" rounded-b="$bew-radius-half" text="sm $bew-text-2">
                  {{ sample.explanation }}
                </div>
              </div>
            </div>

            <!-- Hint -->
            <div v-if="problem.hint" mt-8>
              <h2 mb-4>提示</h2>
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
          :key="'submit'"
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
            <span v-html="renderIcon('mingcute:warning-line', 24)" style="display:contents; color: var(--bew-warning-color);" />
            <div>
              <p fw-bold text="$bew-text-1">未检测到洛谷登录状态</p>
              <p text="sm $bew-text-2">请先在 <a href="https://www.luogu.com.cn" target="_blank" style="color: var(--bew-theme-color); text-decoration: none;" hover="underline">洛谷官网</a> 登录后再提交代码</p>
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
              <input v-model="enableO2" type="checkbox" />
              <span text="sm $bew-text-2">开启 O2 优化</span>
            </label>
          </div>

          <!-- Code editor -->
          <div mb-4>
            <textarea
              v-model="codeContent"
              class="code-editor"
              :placeholder="'// 在此输入你的 ' + selectedLang.name + ' 代码...'"
              spellcheck="false"
            />
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
                <span v-html="renderIcon('mingcute:send-line', 16)" style="display:contents" />
                {{ submitting ? '提交中...' : '提交代码' }}
              </Button>

              <Button type="secondary" @click="openLuoguIDE">
                <span v-html="renderIcon('mingcute:external-link-line', 16)" style="display:contents" />
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

            <div
              v-if="submitError"
              bg="$bew-error-color-20" border="1 $bew-error-color" rounded="$bew-radius-half" p="x-4 y-3"
              text="sm"
              :style="{ color: 'var(--bew-error-color)' }"
            >
              {{ submitError }}
            </div>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- Discussions Tab -->
        <!-- ============================================================ -->
        <div
          v-else-if="activeTab === 'discussions'"
          :key="'discussions'"
          bg="$bew-content" rounded="$bew-radius" p-6
          shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
          border="1 $bew-border-color"
          style="backdrop-filter: var(--bew-filter-glass-1)"
        >
          <div v-if="discussions.length === 0" flex="~ col" items="center" justify="center" py-12 text="$bew-text-2">
            <span v-html="renderIcon('mingcute:comment-line', 48)" style="display:contents" />
            <p text="lg" mt-4 mb-2>暂无讨论</p>
            <p text="sm $bew-text-3" mb-4>这道题目还没有人发起讨论</p>
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
                <img :src="d.author?.avatar" style="width:24px;height:24px;border-radius:50%;object-fit:cover" @error="(e:any)=>{e.target.style.display='none'}" />
                <span :style="{color:d.author?.color?`var(--bew-${d.author.color})`:'var(--bew-text-1)',fontWeight:600,fontSize:'var(--bew-base-font-size)'}">{{ d.author?.name }}</span>
              </div>
              <div flex="1" min-w-0>
                <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ d.title }}</div>
              </div>
              <div flex="~ items-center gap-2" shrink-0 style="font-size:.8em;color:var(--bew-text-3)">
                <span flex="~ items-center gap-1"><span v-html="renderIcon('mingcute:comment-line', 14)" style="display:contents"/>{{ d.replyCount }}</span>
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
          :key="'solutions'"
          bg="$bew-content" rounded="$bew-radius" p-6
          shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
          border="1 $bew-border-color"
          style="backdrop-filter: var(--bew-filter-glass-1)"
        >
          <div flex="~ col" items="center" justify="center" py-12 text="$bew-text-2">
            <span v-html="renderIcon('mingcute:bulb-line', 48)" style="display:contents" />
            <p text="lg" mt-4 mb-2>题解</p>
            <p text="sm $bew-text-3" mb-4>查看本题的题解</p>
            <Button type="primary" @click="openSolutionsPage">
              <span v-html="renderIcon('mingcute:document-line', 16)" style="display:contents" />
              查看题解
            </Button>
          </div>
        </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss">
@import '~/styles/problemContent.scss';
</style>

<style lang="scss" scoped>
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
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', 'Courier New', monospace;
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
  font-size: .75em;
  padding: 2px 10px;
  cursor: pointer;
  transition: all .2s;
  &:hover { background: var(--bew-fill-2); color: var(--bew-text-1); }
  &.copied {
    border-color: var(--bew-success-color-30);
    background: var(--bew-success-color-20);
    color: var(--bew-success-color);
    font-weight: 600;
  }
}
</style>
