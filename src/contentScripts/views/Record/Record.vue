<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { LUOGU_LANGUAGES } from '~/utils/luogu-api'
import hljs from 'highlight.js/lib/core'
import cpp from 'highlight.js/lib/languages/cpp'
import python from 'highlight.js/lib/languages/python'
import java from 'highlight.js/lib/languages/java'

hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', cpp)
hljs.registerLanguage('python', python)
hljs.registerLanguage('java', java)

function highlightCode(code: string, lang: string): string {
  try {
    const map: Record<string, string> = { '28': 'cpp', '3': 'cpp', '4': 'cpp', '11': 'cpp', '12': 'cpp', '27': 'cpp', '2': 'c', '7': 'python', '25': 'python', '8': 'java' }
    const l = map[lang] || 'cpp'
    return hljs.highlight(code, { language: l }).value
  } catch { return code }
}

interface RecordItem {
  rid: number; problem: { pid: string; name: string }; status: string; score: number
  time: number; memory: number; language: string; submitTime: number; user?: { name: string; uid: number }
}

const records = ref<RecordItem[]>([])
const loading = ref(true); const loadingMore = ref(false); const errorMsg = ref('')
const currentPage = ref(1); const totalCount = ref(0); const pageSize = 50
const sentinelRef = ref<HTMLDivElement>()
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))

const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: '等待', color: '#909399' }, 1: { label: '评测中', color: '#3498db' },
  2: { label: '编译中', color: '#3498db' }, 3: { label: '运行中', color: '#3498db' },
  4: { label: 'AC', color: '#52c41a' }, 5: { label: 'WA', color: '#e74c3c' },
  6: { label: 'TLE', color: '#f39c12' }, 7: { label: 'MLE', color: '#f39c12' },
  8: { label: 'RE', color: '#e74c3c' }, 9: { label: 'CE', color: '#e74c3c' },
  10: { label: 'OLE', color: '#f39c12' }, 11: { label: 'UKE', color: '#e74c3c' },
  12: { label: 'AC', color: '#52c41a' },
}

function statusLabel(s: any): string {
  if (typeof s === 'number') return statusMap[s]?.label || `#${s}`
  const n = parseInt(s)
  if (!isNaN(n)) return statusMap[n]?.label || `#${n}`
  return String(s?.name || s?.shortName || s || '?')
}
function statusColor(s: any): string {
  if (typeof s === 'number') return statusMap[s]?.color || '#909399'
  const n = parseInt(s)
  if (!isNaN(n)) return statusMap[n]?.color || '#909399'
  const colors: Record<string, string> = { 'Accepted': '#52c41a', 'Wrong Answer': '#e74c3c' }
  return colors[s?.name || s?.shortName || ''] || '#909399'
}

async function fetchRecords(append = false) {
  if (append) loadingMore.value = true; else loading.value = true
  errorMsg.value = ''
  try {
    const qs = currentPage.value > 1 ? `&page=${currentPage.value}` : ''
    const res = await fetch(`https://www.luogu.com.cn/record/list?_contentOnly=1${qs}`, { credentials: 'same-origin' })
    const json = await res.json()
    const recs = json?.currentData?.records
    if (recs) {
      const items = (recs.result || []).map((rc: any) => ({
        rid: rc.id || 0, problem: { pid: rc.problem?.pid || '', name: rc.problem?.title || '' },
        status: rc.status, score: rc.score || 0, time: rc.time || 0, memory: rc.memory || 0,
        language: rc.language || '', submitTime: rc.submitTime || 0, user: rc.user,
      }))
      records.value = append ? [...records.value, ...items] : items
      totalCount.value = recs.count || items.length
    } else { errorMsg.value = '未登录或数据格式不匹配' }
  } catch (e: any) { errorMsg.value = e.message }
  finally { loading.value = false; loadingMore.value = false }
}

function loadMore() {
  if (loadingMore.value || currentPage.value >= totalPages.value) return
  currentPage.value++; fetchRecords(true)
}
// Detect if we're on a detail page
const recordId = computed(() => { const m = document.URL.match(/\/record\/(\d+)/i); return m ? Number(m[1]) : null })
const detail = ref<any>(null)
const detailLoading = ref(false)

async function fetchDetail(id: number) {
  detailLoading.value = true
  try {
    const res = await fetch(`https://www.luogu.com.cn/record/${id}?_contentOnly=1`, { credentials: 'same-origin' })
    const json = await res.json()
    detail.value = json?.currentData?.record || null
  } catch {}
  detailLoading.value = false
}

function openRecord(rid: number) { window.location.href = `https://www.luogu.com.cn/record/${rid}` }
function backToList() { window.location.href = 'https://www.luogu.com.cn/record/list' }
function openProblem(pid: string) { window.open(`https://www.luogu.com.cn/problem/${pid}`, '_blank') }
function langName(id: number | string): string {
  const lang = LUOGU_LANGUAGES.find(l => l.id === Number(id))
  return lang?.name || String(id)
}
function timeAgo(ts: number): string {
  const d = Math.floor(Date.now()/1000) - ts
  if (d < 3600) return `${Math.floor(d/60)}分前`; if (d < 86400) return `${Math.floor(d/3600)}时前`; return `${Math.floor(d/86400)}天前`
}

onMounted(() => { recordId.value ? fetchDetail(recordId.value) : fetchRecords() })
let obs: IntersectionObserver | null = null
onMounted(() => {
  obs = new IntersectionObserver((e) => { if (e[0]?.isIntersecting && !loading.value && !loadingMore.value) loadMore() }, { rootMargin: '400px' })
  nextTick(() => { if (obs && sentinelRef.value) obs.observe(sentinelRef.value) })
})
watch(sentinelRef, (el) => { obs?.disconnect(); if (el) obs?.observe(el as Element) })
onUnmounted(() => obs?.disconnect())
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <!-- Detail View -->
    <template v-if="recordId">
      <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
        <button @click="backToList" style="background:none;border:none;cursor:pointer;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)" mb-2>← 返回记录列表</button>
        <h1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">评测记录 #{{ recordId }}</h1>
      </div>
      <Loading v-if="detailLoading" />
      <Transition name="content-reveal">
        <div v-if="!detailLoading && detail" bg="$bew-content" rounded="$bew-radius" p-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <!-- Status header -->
          <div flex="~ items-center gap-3" mb-4 pb-4 border="b-1 $bew-border-color">
            <div :style="{fontSize:'1.5em',fontWeight:700,color:statusColor(detail.status)}">{{ statusLabel(detail.status) }}</div>
            <div v-if="detail.score!=null" :style="{fontSize:'1.2em',fontWeight:600,color:detail.score>=100?'var(--bew-success-color)':'var(--bew-error-color)'}">{{ detail.score }}分</div>
          </div>
          <!-- Info grid -->
          <div grid="~ cols-2 md:cols-4" gap-4 mb-4 style="font-size:var(--bew-base-font-size)">
            <div><span style="color:var(--bew-text-3)">题目</span><br><span @click="openProblem(detail.problem.pid)" style="color:var(--bew-theme-color);cursor:pointer;font-weight:500">{{ detail.problem.pid }} {{ detail.problem.title }}</span></div>
            <div><span style="color:var(--bew-text-3)">时间</span><br><span style="color:var(--bew-text-1)">{{ detail.time }}ms</span></div>
            <div><span style="color:var(--bew-text-3)">内存</span><br><span style="color:var(--bew-text-1)">{{ (detail.memory/1024).toFixed(1) }}MB</span></div>
            <div><span style="color:var(--bew-text-3)">语言</span><br><span style="color:var(--bew-text-1)">{{ langName(detail.language) }} {{ detail.enableO2 ? '(O2)' : '' }}</span></div>
            <div><span style="color:var(--bew-text-3)">代码长度</span><br><span style="color:var(--bew-text-1)">{{ detail.sourceCodeLength }}B</span></div>
            <div><span style="color:var(--bew-text-3)">提交时间</span><br><span style="color:var(--bew-text-1)">{{ new Date(detail.submitTime*1000).toLocaleString('zh-CN') }}</span></div>
          </div>
          <!-- Compile message if CE -->
          <div v-if="detail.detail?.compileResult?.message" bg="$bew-fill-1" rounded="$bew-radius" p-4 mb-4 style="font-size:var(--bew-base-font-size);white-space:pre-wrap;font-family:monospace;max-height:300px;overflow-y:auto;color:var(--bew-text-1)">
            {{ detail.detail.compileResult.message }}
          </div>
          <!-- Test case blocks — Luogu-style colored squares -->
          <div v-if="detail.detail?.judgeResult?.subtasks?.length" mt-4>
            <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-2);font-weight:600" mb-2>测试点详情</div>
            <template v-for="sub in detail.detail.judgeResult.subtasks" :key="sub.id">
              <div mb-3>
                <div flex="~ wrap" gap-2>
                  <div v-for="(tc, idx) in Object.entries(sub.testCases||{}).sort(([a],[b])=>Number(a)-Number(b)).map(([,v])=>v)" :key="idx" class="tc-block" :style="{background:statusColor(parseInt(tc.status))}">
                    <div class="tc-content">
                      <div class="tc-info">{{ tc.time }}ms / {{ (tc.memory/1024).toFixed(1) }}MB</div>
                      <div class="tc-status">{{ statusLabel(parseInt(tc.status)) }}</div>
                    </div>
                    <div class="tc-id">#{{ idx+1 }}</div>
                    <div class="tc-msg">{{ tc.score }} 分 · {{ tc.description || '' }}</div>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Source code with highlighting -->
          <div v-if="detail.sourceCode" mt-4>
            <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-2);font-weight:600" mb-2>源代码</div>
            <pre bg="$bew-fill-1" rounded="$bew-radius" p-4 style="font-size:var(--bew-base-font-size);font-family:monospace;max-height:400px;overflow:auto;color:var(--bew-text-1);tab-size:4" v-html="highlightCode(detail.sourceCode, String(detail.language))" />
          </div>
        </div>
      </Transition>
    </template>

    <!-- List View -->
    <template v-else>
    <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
      <h1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700" mb-2>评测记录</h1>
      <p style="font-size:var(--bew-base-font-size);color:var(--bew-text-2)">共 {{ totalCount }} 条记录</p>
    </div>

    <Loading v-if="loading" />
    <div v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" text="center $bew-text-2">
      <span v-html="renderIcon('mingcute:warning-line',32)" style="display:contents"/><p mt-2>{{ errorMsg }}</p>
    </div>

    <Transition name="content-reveal">
      <div v-if="!loading && records.length>0" bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden">
        <div v-for="(r, idx) in records" :key="r.rid" class="stagger-row hover:bg-$bew-fill-2" :style="{'--row-index':idx}" flex="~ items-center" p="x-4 md:x-6 y-3" border="b-1 $bew-border-color" cursor="pointer" duration-200 @click="openRecord(r.rid)">
          <div w="80px" flex-shrink-0>
            <span :style="{color:statusColor(r.status),fontSize:'var(--bew-base-font-size)',fontWeight:600}">{{ statusLabel(r.status) }}</span>
          </div>
          <div flex="1" min-w-0>
            <div @click.stop="openProblem(r.problem.pid)" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;cursor:pointer" class="hover:underline">{{ r.problem.pid }} {{ r.problem.name }}</div>
            <div flex="~ gap-3" mt-1 style="font-size:calc(var(--bew-base-font-size) * 0.85);color:var(--bew-text-3)">
              <span>#{{ r.rid }}</span>
              <span v-if="r.time">{{ r.time }}ms</span>
              <span v-if="r.memory">{{ (r.memory/1024).toFixed(1) }}MB</span>
              <span>{{ langName(r.language) }}</span>
              <span>{{ timeAgo(r.submitTime) }}</span>
            </div>
          </div>
          <div v-if="r.score != null" flex-shrink-0 text-right style="font-size:var(--bew-base-font-size);font-weight:600" :style="{color:r.score>=100?'var(--bew-success-color)':'var(--bew-error-color)'}">
            {{ r.score }}分
          </div>
        </div>
      </div>
    </Transition>

    <Loading v-if="loadingMore" />
    <div v-if="!loading && records.length>0 && currentPage<totalPages" ref="sentinelRef" style="height:60px;display:flex;align-items:center;justify-content:center;font-size:var(--bew-base-font-size);color:var(--bew-text-3)">向下滚动加载更多...</div>
    <div v-if="!loading && records.length>0 && currentPage>=totalPages" style="font-size:var(--bew-base-font-size);color:var(--bew-text-3);text-align:center;padding-bottom:2rem">已加载全部 {{ totalCount }} 条记录</div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.tc-block { width:120px;border-radius:8px;padding:8px;color:#fff;font-size:var(--bew-base-font-size); }
.tc-content { margin-bottom:4px; }
.tc-info { font-size:.75em;opacity:.9; }
.tc-status { font-weight:700;font-size:1em; }
.tc-id { font-size:.8em;font-weight:600; }
.tc-msg { font-size:.7em;margin-top:2px; }
:deep(pre code) { font-family:"Cascadia Code","Fira Code","JetBrains Mono",monospace;font-size:.875em; }
:deep(.hljs-keyword) { color:#c678dd; }
:deep(.hljs-string) { color:#98c379; }
:deep(.hljs-number) { color:#d19a66; }
:deep(.hljs-comment) { color:var(--bew-text-4);font-style:italic; }
:deep(.hljs-function) { color:#61afef; }
:deep(.hljs-built_in) { color:#e5c07b; }
</style>
