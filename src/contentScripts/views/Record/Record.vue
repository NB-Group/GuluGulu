<script setup lang="ts">
import hljs from 'highlight.js/lib/core'
import cpp from 'highlight.js/lib/languages/cpp'
import java from 'highlight.js/lib/languages/java'
import python from 'highlight.js/lib/languages/python'

import { useGulyApp } from '~/composables/useAppProvider'
import { AppPage } from '~/enums/appEnums'
import { renderIcon } from '~/utils/icons'
import { friendlyError, LUOGU_LANGUAGES } from '~/utils/luogu-api'
import { timeAgo } from '~/utils/main'

hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', cpp)
hljs.registerLanguage('python', python)
hljs.registerLanguage('java', java)

const { currentUrl, navigateTo } = useGulyApp()

function highlightCode(code: string, lang: string): string {
  try {
    const map: Record<string, string> = { '28': 'cpp', '3': 'cpp', '4': 'cpp', '11': 'cpp', '12': 'cpp', '27': 'cpp', '2': 'c', '7': 'python', '25': 'python', '8': 'java' }
    const l = map[lang] || 'cpp'
    return hljs.highlight(code, { language: l }).value
  }
  catch { return code }
}

// ============================================================
// Status maps — record-level AND test-case-level
// ============================================================
const statusMap: Record<number, { label: string, color: string }> = {
  0: { label: 'Waiting', color: '#909399' },
  1: { label: 'Judging', color: '#3498db' },
  2: { label: 'Compiling', color: '#3498db' },
  3: { label: 'Running', color: '#3498db' },
  4: { label: 'AC', color: '#52c41a' },
  5: { label: 'WA', color: '#e74c3c' },
  6: { label: 'WA', color: '#e74c3c' },
  7: { label: 'TLE', color: '#f39c12' },
  8: { label: 'MLE', color: '#f39c12' },
  9: { label: 'RE', color: '#e74c3c' },
  10: { label: 'CE', color: '#e74c3c' },
  11: { label: 'OLE', color: '#f39c12' },
  12: { label: 'AC', color: '#52c41a' },
  14: { label: 'WA', color: '#e74c3c' },
}

// Test case status codes (different from record-level!)
const tcStatusMap: Record<number, { label: string, color: string }> = {
  0: { label: '?', color: '#909399' },
  1: { label: 'AC', color: '#52c41a' }, // some versions use 1
  2: { label: 'WA', color: '#e74c3c' },
  3: { label: 'TLE', color: '#052242' }, // Luogu's actual TLE color: dark navy
  4: { label: 'MLE', color: '#e74c3c' },
  5: { label: 'TLE', color: '#052242' },
  6: { label: 'WA', color: '#e74c3c' },
  7: { label: 'RE', color: '#e74c3c' },
  8: { label: 'CE', color: '#e74c3c' },
  9: { label: 'OLE', color: '#f39c12' },
  10: { label: 'UKE', color: '#e74c3c' },
  11: { label: 'PC', color: '#f39c12' },
  12: { label: 'AC', color: '#52c41a' },
  13: { label: 'SC', color: '#52c41a' },
}

function tcStatus(tc: any): { label: string, color: string } {
  const st = Number.parseInt(tc.status)
  if (!isNaN(st) && tcStatusMap[st])
    return tcStatusMap[st]
  // Fallback: parse description
  const desc = (tc.description || '').toLowerCase()
  if (desc.includes('accepted') || tc.score > 0)
    return { label: 'AC', color: '#52c41a' }
  if (desc.includes('wrong answer'))
    return { label: 'WA', color: '#e74c3c' }
  if (desc.includes('time limit'))
    return { label: 'TLE', color: '#052242' }
  if (desc.includes('memory limit'))
    return { label: 'MLE', color: '#e74c3c' }
  if (desc.includes('runtime error'))
    return { label: 'RE', color: '#e74c3c' }
  return { label: '?', color: '#909399' }
}

// Format time: Luogu shows "1.20s" for >=1000ms, "Nms" otherwise
function formatTime(ms: number): string {
  if (ms >= 1000)
    return `${(ms / 1000).toFixed(2)}s`
  return `${ms}ms`
}

// Format memory: Luogu shows "812.00KB" or "1.04MB"
function formatMemory(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(2)}MB`
  return `${(bytes / 1024).toFixed(2)}KB`
}

function statusLabel(s: number): string {
  return statusMap[s]?.label || String(s)
}
function statusColor(s: number): string {
  return statusMap[s]?.color || '#909399'
}

// ============================================================
// Record list
// ============================================================
interface RecordItem {
  rid: number
  problem: { pid: string, name: string }
  status: number
  score: number | null
  time: number
  memory: number
  language: string
  submitTime: number
}
const records = ref<RecordItem[]>([])
const loading = ref(true); const loadingMore = ref(false); const errorMsg = ref('')
const listPage = ref(1); const totalCount = ref(0)
const perPage = 20 // Luogu API uses 20 per page
const sentinelRef = ref<HTMLDivElement>()
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / perPage)))

async function fetchRecords(append = false) {
  if (append)
    loadingMore.value = true; else loading.value = true
  errorMsg.value = ''
  try {
    const res = await fetch(`https://www.luogu.com.cn/record/list?_contentOnly=1&page=${listPage.value}`, { credentials: 'same-origin' })
    const json = await res.json()
    const recs = json?.data?.records || json?.currentData?.records
    if (recs) {
      const items = (recs.result || []).map((rc: any) => ({
        rid: rc.id || 0,
        problem: { pid: rc.problem?.pid || '', name: rc.problem?.title || '' },
        status: rc.status,
        score: rc.score,
        time: rc.time || 0,
        memory: rc.memory || 0,
        language: rc.language || '',
        submitTime: rc.submitTime || 0,
      }))
      records.value = append ? [...records.value, ...items] : items
      totalCount.value = recs.count || items.length
    }
    else { errorMsg.value = '未登录或数据格式不匹配' }
  }
  catch (e: any) { errorMsg.value = friendlyError(e) }
  finally { loading.value = false; loadingMore.value = false }
}

function loadMore() {
  if (loadingMore.value || listPage.value >= totalPages.value)
    return
  listPage.value++; fetchRecords(true)
}

// ============================================================
// Record detail
// ============================================================
const recordId = computed(() => { const m = currentUrl.value.match(/\/record\/(\d+)/i); return m ? Number(m[1]) : null })
const detail = ref<any>(null)
const detailLoading = ref(false)
// Auto-refresh: poll while the record is still being judged.
const PENDING_STATUS = new Set([0, 1, 2, 3]) // Waiting / Judging / Compiling / Running
let detailPollTimer: ReturnType<typeof setTimeout> | null = null
let detailPollCount = 0
function clearDetailPoll() {
  if (detailPollTimer) { clearTimeout(detailPollTimer); detailPollTimer = null }
  detailPollCount = 0
}

async function fetchDetail(id: number) {
  // Only show the loading spinner on the first fetch — polls update silently.
  if (!detail.value)
    detailLoading.value = true
  try {
    const res = await fetch(`https://www.luogu.com.cn/record/${id}?_contentOnly=1`, { credentials: 'same-origin' })
    const json = await res.json()
    detail.value = json?.data?.record || json?.currentData?.record || null
  }
  catch {}
  detailLoading.value = false
  // Keep polling every 2s while still judging; stop on final status, navigation
  // away, unmount, or after ~3 min (90 tries) as a runaway safety cap.
  if (detail.value && PENDING_STATUS.has(detail.value.status) && detailPollCount < 90) {
    detailPollCount++
    detailPollTimer = setTimeout(() => fetchDetail(id), 2000)
  }
}

// Normalize subtasks/testCases into display-ready groups
const testCaseGroups = computed(() => {
  const subs = detail.value?.detail?.judgeResult?.subtasks
  if (!subs)
    return []
  const subList = Array.isArray(subs) ? subs : Object.values(subs)
  return subList.map((sub: any) => {
    const tcs = sub.testCases
    const caseList = Array.isArray(tcs) ? tcs : Object.values(tcs || {})
    return {
      id: sub.id ?? 0,
      score: sub.score,
      fullScore: sub.fullScore,
      status: sub.status,
      cases: caseList.map((tc: any) => ({
        id: tc.id,
        status: Number.parseInt(tc.status),
        score: tc.score,
        time: tc.time,
        memory: tc.memory,
        description: tc.description || '',
        ...tcStatus(tc),
      })),
    }
  }).filter(g => g.cases.length > 0)
})

// Tooltip state for test case blocks
const hoveredTc = ref<{ key: string, desc: string, x: number, y: number } | null>(null)
let tcHideTimer: ReturnType<typeof setTimeout> | null = null

function showTcTooltip(e: MouseEvent, key: string, desc: string) {
  if (tcHideTimer) { clearTimeout(tcHideTimer); tcHideTimer = null }
  if (!desc)
    return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  hoveredTc.value = { key, desc, x: rect.left + rect.width / 2, y: rect.top - 8 }
}
function hideTcTooltip() {
  tcHideTimer = setTimeout(() => { hoveredTc.value = null }, 150)
}
// Cancel a pending hide so hovering the tooltip itself keeps it visible.
// Must live in <script setup> — Vue templates don't expose `clearTimeout` as a
// global, so calling it inline in the template resolves to undefined and throws.
function cancelTcHide() {
  if (tcHideTimer) { clearTimeout(tcHideTimer); tcHideTimer = null }
}

function openRecord(rid: number) { navigateTo(AppPage.Record, `https://www.luogu.com.cn/record/${rid}`) }
function backToList() { navigateTo(AppPage.Record, 'https://www.luogu.com.cn/record/list') }
function openProblem(pid: string) { navigateTo(AppPage.ProblemDetail, `https://www.luogu.com.cn/problem/${pid}`) }
function langName(id: number | string): string {
  const lang = LUOGU_LANGUAGES.find(l => l.id === Number(id))
  return lang?.name || String(id)
}

function loadContent() {
  clearDetailPoll()
  if (recordId.value) { detail.value = null; fetchDetail(recordId.value) }
  else { detail.value = null; listPage.value = 1; records.value = []; fetchRecords() }
}
onMounted(loadContent)
watch(recordId, () => loadContent())

// Infinite scroll observer
let obs: IntersectionObserver | null = null
onMounted(() => {
  obs = new IntersectionObserver((e) => {
    if (e[0]?.isIntersecting && !loading.value && !loadingMore.value)
      loadMore()
  }, { rootMargin: '1200px' })
  nextTick(() => {
    if (obs && sentinelRef.value)
      obs.observe(sentinelRef.value)
  })
})
watch(sentinelRef, (el) => {
  obs?.disconnect(); if (el)
    obs?.observe(el as Element)
})
onUnmounted(() => {
  obs?.disconnect()
  clearDetailPoll()
  if (tcHideTimer)
    clearTimeout(tcHideTimer)
})
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <!-- ============================================================ -->
    <!-- Detail View -->
    <!-- ============================================================ -->
    <template v-if="recordId">
      <div
        bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
        border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)"
      >
        <button style="background:none;border:none;cursor:pointer;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)" mb-2 @click="backToList">
          ← 返回记录列表
        </button>
        <h1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">
          评测记录 #{{ recordId }}
        </h1>
      </div>
      <Loading v-if="detailLoading" />
      <Transition name="content-reveal">
        <div
          v-if="!detailLoading && detail" bg="$bew-content" rounded="$bew-radius" p-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
          border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)"
        >
          <!-- Status header -->
          <div flex="~ items-center gap-4" mb-4 pb-4 border="b-1 $bew-border-color">
            <div :style="{ fontSize: '1.5em', fontWeight: 700, color: statusColor(detail.status) }">
              {{ statusLabel(detail.status) }}
            </div>
            <div v-if="detail.score != null" :style="{ fontSize: '1.2em', fontWeight: 600, color: detail.status === 12 || detail.status === 4 ? 'var(--bew-success-color)' : 'var(--bew-error-color)' }">
              {{ detail.score }} 分
            </div>
          </div>

          <!-- Info grid -->
          <div grid="~ cols-2 md:cols-4" gap-4 mb-6 style="font-size:var(--bew-base-font-size)">
            <div><span style="color:var(--bew-text-3)">题目</span><br><span style="color:var(--bew-theme-color);cursor:pointer;font-weight:500" @click="openProblem(detail.problem.pid)">{{ detail.problem.pid }} {{ detail.problem.title }}</span></div>
            <div><span style="color:var(--bew-text-3)">用时</span><br><span style="color:var(--bew-text-1)">{{ formatTime(detail.time || 0) }}</span></div>
            <div><span style="color:var(--bew-text-3)">内存</span><br><span style="color:var(--bew-text-1)">{{ formatMemory(detail.memory || 0) }}</span></div>
            <div><span style="color:var(--bew-text-3)">语言</span><br><span style="color:var(--bew-text-1)">{{ langName(detail.language) }} {{ detail.enableO2 ? '(O2)' : '' }}</span></div>
            <div><span style="color:var(--bew-text-3)">代码长度</span><br><span style="color:var(--bew-text-1)">{{ detail.sourceCodeLength }} B</span></div>
            <div><span style="color:var(--bew-text-3)">提交时间</span><br><span style="color:var(--bew-text-1)">{{ new Date(detail.submitTime * 1000).toLocaleString('zh-CN') }}</span></div>
          </div>

          <!-- Compile error message -->
          <div
            v-if="detail.detail?.compileResult?.message" bg="$bew-fill-1" rounded="$bew-radius" p-4 mb-6
            style="font-size:var(--bew-base-font-size);white-space:pre-wrap;font-family:monospace;max-height:300px;overflow-y:auto;color:var(--bew-text-1)"
          >
            {{ detail.detail.compileResult.message }}
          </div>

          <!-- Test case blocks — Luogu-style colored squares -->
          <template v-if="testCaseGroups.length > 0">
            <div v-for="(sub, si) in testCaseGroups" :key="si" mb-6>
              <div v-if="testCaseGroups.length > 1" style="font-size:.85em;color:var(--bew-text-2);font-weight:600" mb-2>
                Subtask #{{ sub.id }} {{ sub.fullScore != null ? `(${sub.score ?? 0}/${sub.fullScore} 分)` : `(${sub.score ?? 0} 分)` }}
              </div>
              <div flex="~ wrap" gap-2>
                <div
                  v-for="(tc, idx) in sub.cases" :key="idx"
                  class="tc-block"
                  :style="{ backgroundColor: tc.color }"
                  @mouseenter="showTcTooltip($event, `${sub.id}-${idx}`, tc.description)"
                  @mouseleave="hideTcTooltip"
                >
                  <div class="tc-line1">
                    {{ formatTime(tc.time || 0) }} / {{ formatMemory(tc.memory || 0) }}
                  </div>
                  <div class="tc-line2">
                    {{ tc.label }}
                  </div>
                  <div class="tc-line3">
                    #{{ idx + 1 }}
                  </div>
                  <div class="tc-line4">
                    {{ tc.score ?? 0 }} 分
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Source code -->
          <div v-if="detail.sourceCode" mt-6>
            <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-2);font-weight:600" mb-2>
              源代码
            </div>
            <pre bg="$bew-fill-1" rounded="$bew-radius" p-4 style="font-size:var(--bew-base-font-size);font-family:monospace;max-height:400px;overflow:auto;color:var(--bew-text-1);tab-size:4" v-html="highlightCode(detail.sourceCode, String(detail.language))" />
          </div>
        </div>
      </Transition>
    </template>

    <!-- ============================================================ -->
    <!-- List View -->
    <!-- ============================================================ -->
    <template v-else>
      <div
        bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
        border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)"
      >
        <h1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700" mb-2>
          评测记录
        </h1>
        <p style="font-size:var(--bew-base-font-size);color:var(--bew-text-2)">
          共 {{ totalCount }} 条记录
        </p>
      </div>

      <Loading v-if="loading" />
      <div
        v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color"
        text="center $bew-text-2"
      >
        <span style="display:contents" v-html="renderIcon('mingcute:warning-line', 32)" /><p mt-2>
          {{ errorMsg }}
        </p>
      </div>

      <Transition name="content-reveal">
        <div
          v-if="!loading && records.length > 0" bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color"
          style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden"
        >
          <div
            v-for="(r, idx) in records" :key="r.rid" class="stagger-row hover:bg-$bew-fill-2" :style="{ '--row-index': idx }" flex="~ items-center"
            p="x-4 md:x-6 y-3" border="b-1 $bew-border-color" cursor="pointer" duration-200 @click="openRecord(r.rid)"
          >
            <div w="80px" flex-shrink-0>
              <span :style="{ color: statusColor(r.status), fontSize: 'var(--bew-base-font-size)', fontWeight: 600 }">{{ statusLabel(r.status) }}</span>
            </div>
            <div flex="1" min-w-0>
              <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;cursor:pointer" class="hover:underline" @click.stop="openProblem(r.problem.pid)">
                {{ r.problem.pid }} {{ r.problem.name }}
              </div>
              <div flex="~ gap-3" mt-1 style="font-size:calc(var(--bew-base-font-size) * 0.85);color:var(--bew-text-3)">
                <span>#{{ r.rid }}</span>
                <span v-if="r.time">{{ formatTime(r.time) }}</span>
                <span v-if="r.memory">{{ formatMemory(r.memory) }}</span>
                <span>{{ langName(r.language) }}</span>
                <span>{{ timeAgo(r.submitTime) }}</span>
              </div>
            </div>
            <div v-if="r.score != null" flex-shrink-0 text-right style="font-size:var(--bew-base-font-size);font-weight:600" :style="{ color: r.score === 100 ? 'var(--bew-success-color)' : 'var(--bew-error-color)' }">
              {{ r.score }} 分
            </div>
          </div>
        </div>
      </Transition>

      <Loading v-if="loadingMore" />
      <div v-if="!loading && records.length > 0 && listPage < totalPages" ref="sentinelRef" style="height:60px;display:flex;align-items:center;justify-content:center;font-size:var(--bew-base-font-size);color:var(--bew-text-3)">
        向下滚动加载更多...
      </div>
      <div v-if="!loading && records.length > 0 && listPage >= totalPages" style="font-size:var(--bew-base-font-size);color:var(--bew-text-3);text-align:center;padding-bottom:2rem">
        已加载全部 {{ totalCount }} 条记录
      </div>
    </template>

    <!-- TC description tooltip (fixed-position, inside shadow DOM) -->
    <Transition name="tc-tip">
      <div
        v-if="hoveredTc"
        class="tc-tooltip"
        :style="{ left: `${hoveredTc.x}px`, top: `${hoveredTc.y}px` }"
        @mouseenter="cancelTcHide"
        @mouseleave="hideTcTooltip"
      >
        {{ hoveredTc.desc }}
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
/* Luogu-style test case blocks */
.tc-block {
  width: 120px;
  border-radius: 8px;
  padding: 8px 10px;
  color: #fff;
  font-size: var(--bew-base-font-size);
  line-height: 1.3;
}
.tc-line1 {
  font-size: 0.7em;
  opacity: 0.85;
}
.tc-line2 {
  font-size: 1em;
  font-weight: 700;
  margin-top: 1px;
}
.tc-line3 {
  font-size: 0.75em;
  font-weight: 600;
  opacity: 0.9;
  margin-top: 1px;
}
.tc-line4 {
  font-size: 0.65em;
  opacity: 0.8;
  margin-top: 1px;
  cursor: default;
}

/* TC description tooltip */
.tc-tooltip {
  position: fixed;
  transform: translate(-50%, -100%);
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: calc(var(--bew-base-font-size) * 0.8);
  max-width: 360px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
  z-index: 99999;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.tc-tip-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.tc-tip-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.tc-tip-enter-from {
  opacity: 0;
  transform: translate(-50%, calc(-100% + 6px));
}
.tc-tip-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-100% + 4px));
}

:deep(pre code) {
  font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", monospace;
  font-size: 0.875em;
}
:deep(.hljs-keyword) {
  color: #c678dd;
}
:deep(.hljs-string) {
  color: #98c379;
}
:deep(.hljs-number) {
  color: #d19a66;
}
:deep(.hljs-comment) {
  color: var(--bew-text-4);
  font-style: italic;
}
:deep(.hljs-function) {
  color: #61afef;
}
:deep(.hljs-built_in) {
  color: #e5c07b;
}
</style>
