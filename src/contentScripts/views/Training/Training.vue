<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { friendlyError } from '~/utils/luogu-api'
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'
import { diffLabel, diffColor } from '~/utils/difficulty'

const { navigateTo } = useGulyApp()

function backToList() {
  const ref = document.referrer || ''
  if (/\/team\//.test(ref)) window.history.back()
  else navigateTo(AppPage.Training, 'https://www.luogu.com.cn/training/list')
}

// ============================================================
// List view — fetch via frontend API
// ============================================================
const trainings = ref<any[]>([])
const loading = ref(true); const errorMsg = ref('')

async function fetchTrainings() {
  loading.value = true; errorMsg.value = ''
  try {
    const res = await fetch('https://www.luogu.com.cn/training/list', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const cd = ctx?.data || ctx?.currentData || {}
      const raw = cd.trainings || []
      const list = Array.isArray(raw) ? raw : (raw.result || [])
      const acCounts = cd.acCounts || {}
      trainings.value = list.map((t: any) => ({
        id: t.id, name: t.name, problemCount: t.problemCount || 0,
        markCount: t.markCount || 0, acCount: acCounts[t.id] || 0,
      }))
    } else { errorMsg.value = '请先登录洛谷' }
  } catch (e: any) { errorMsg.value = friendlyError(e) }
  finally { loading.value = false }
}

// ============================================================
// Detail view — fetch via lentille-context
// ============================================================
const trainingId = computed(() => { const m = document.URL.match(/\/training\/(\d+)/i); return m ? Number(m[1]) : null })
const detailProblems = ref<any[]>([])
const detailName = ref('')
const detailLoading = ref(false)
const detailMeta = ref<any>(null)

async function fetchDetail(id: number) {
  detailLoading.value = true
  try {
    const res = await fetch(`https://www.luogu.com.cn/training/${id}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const t = ctx?.data?.training || ctx?.currentData?.training || {}
      detailName.value = t.name || t.title || ''
      detailMeta.value = { problemCount: t.problems?.length || 0, markCount: t.markCount || 0 }
      detailProblems.value = (t.problems || []).map((p: any) => ({
        pid: String(p.pid || ''),
        title: p.name || p.title || '',
        difficulty: p.difficulty || 0,
        submitted: p.submitted || false,
        accepted: p.accepted || false,
        totalSubmit: p.totalSubmit || 0,
        totalAccepted: p.totalAccepted || 0,
      }))
    }
  } catch {}
  detailLoading.value = false
}

function passRate(ac: number, sub: number): string {
  if (!sub) return '—'
  return Math.round((ac / sub) * 100) + '%'
}

function openTraining(id: number) { navigateTo(AppPage.Training, `https://www.luogu.com.cn/training/${id}`) }
function openProblem(pid: string) { navigateTo(AppPage.ProblemDetail, `https://www.luogu.com.cn/problem/${pid}`) }

function loadTrainingContent() {
  if (trainingId.value) { detailProblems.value = []; fetchDetail(trainingId.value) }
  else { detailProblems.value = []; fetchTrainings() }
}
onMounted(loadTrainingContent)
watch(trainingId, () => loadTrainingContent())
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <!-- ============================================================ -->
    <!-- Detail View -->
    <!-- ============================================================ -->
    <template v-if="trainingId">
      <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
        <button @click="backToList" style="background:none;border:none;cursor:pointer;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)" mb-2>← 返回</button>
        <h1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">{{ detailName || '加载中...' }}</h1>
        <div v-if="detailMeta" mt-2 flex="~ gap-4" style="font-size:.85em;color:var(--bew-text-3)">
          <span>{{ detailMeta.problemCount }} 题</span>
          <span>{{ detailMeta.markCount }} 人收藏</span>
        </div>
      </div>
      <Loading v-if="detailLoading" />
      <Transition name="content-reveal">
        <div v-if="!detailLoading && detailProblems.length>0" bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden">
          <div
            v-for="(p, idx) in detailProblems" :key="p.pid"
            class="stagger-row training-problem-row"
            :style="{'--row-index':idx}"
            flex="~ items-center" p="x-4 y-3" border="b-1 $bew-border-color"
            cursor="pointer" duration-200 @click="openProblem(p.pid)"
          >
            <!-- PID with enough space for irregular IDs -->
            <span style="font-size:.85em;color:var(--bew-text-3);font-family:monospace;min-width:100px;max-width:140px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" mr-3>{{ p.pid }}</span>
            <!-- Difficulty badge -->
            <span v-if="p.difficulty" px-2 py-0.5 rounded-full mr-3 flex-shrink-0 style="font-size:.7em;font-weight:600;white-space:nowrap" :style="{ color: diffColor(p.difficulty), background: `${diffColor(p.difficulty)}20` }">{{ diffLabel(p.difficulty) }}</span>
            <!-- Title -->
            <span flex-1 min-w-0 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ p.title }}</span>
            <!-- Pass rate -->
            <span flex-shrink-0 mx-3 style="font-size:.8em;color:var(--bew-text-3);white-space:nowrap">{{ passRate(p.totalAccepted, p.totalSubmit) }}</span>
            <!-- Status -->
            <span v-if="p.accepted" flex-shrink-0 style="color:var(--bew-success-color);font-size:var(--bew-base-font-size)" flex="~ items-center gap-1"><span v-html="renderIcon('mingcute:check-circle-fill',16)" style="display:contents"/> AC</span>
            <span v-else-if="p.submitted" flex-shrink-0 style="color:var(--bew-error-color);font-size:var(--bew-base-font-size)">WA</span>
            <span v-else flex-shrink-0 style="color:var(--bew-text-4);font-size:var(--bew-base-font-size)">—</span>
          </div>
        </div>
      </Transition>
    </template>

    <!-- ============================================================ -->
    <!-- List View -->
    <!-- ============================================================ -->
    <template v-else>
      <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
        <h1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700" mb-4>题单</h1>
        <p style="color:var(--bew-text-2);font-size:var(--bew-base-font-size)">共 {{ trainings.length }} 个题单</p>
      </div>
      <Loading v-if="loading" />
      <div v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" text="center $bew-text-2">
        <span v-html="renderIcon('mingcute:warning-line',32)" style="display:contents"/><p mt-2>{{ errorMsg }}</p>
      </div>
      <Transition name="content-reveal">
        <div v-if="!loading && trainings.length>0" grid="~ cols-1 md:cols-2 xl:cols-3" gap-4 mb-6>
          <div v-for="(t, idx) in trainings" :key="t.id" class="stagger-card training-card" :style="{ '--card-index': idx, backdropFilter: 'var(--bew-filter-glass-1)' }" bg="$bew-content" rounded="$bew-radius" p-5 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" cursor="pointer" @click="openTraining(t.id)">
            <h3 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600" mb-3>{{ t.name }}</h3>
            <div flex="~ items-center gap-4" style="font-size:var(--bew-base-font-size);color:var(--bew-text-2)">
              <span flex="~ items-center gap-1"><span v-html="renderIcon('mingcute:document-line',14)" style="display:contents"/>{{ t.problemCount }} 题</span>
              <span v-if="t.acCount" flex="~ items-center gap-1" style="color:var(--bew-success-color)"><span v-html="renderIcon('mingcute:check-circle-line',14)" style="display:contents"/>{{ t.acCount }} 已完成</span>
            </div>
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.training-card { transition: box-shadow .2s,transform .2s }
.training-card:hover { box-shadow:var(--bew-shadow-2)!important;transform:translateY(-2px) }
.training-problem-row { transition: background .15s }
.training-problem-row:hover { background: var(--bew-fill-2) }
</style>
