<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { friendlyError } from '~/utils/luogu-api'
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'

const { navigateTo } = useGulyApp()

function backToList() { navigateTo(AppPage.Training, 'https://www.luogu.com.cn/training/list') }

interface TrainingSet {
  id: number; name: string; problemCount: number; markCount: number; acCount?: number
}
interface TrainingProblem {
  pid: string; title: string; submitted?: boolean; accepted?: boolean
}

const trainings = ref<TrainingSet[]>([])
const loading = ref(true); const errorMsg = ref('')

// Detail state
const trainingId = computed(() => { const m = document.URL.match(/\/training\/(\d+)/i); return m ? Number(m[1]) : null })
const detailProblems = ref<TrainingProblem[]>([])
const detailName = ref('')
const detailLoading = ref(false)

async function fetchTrainings() {
  loading.value = true; errorMsg.value = ''
  try {
    const data = await browser.runtime.sendMessage({ contentScriptQuery: 'TRAINING.getList' })
    if (data?.error) { errorMsg.value = data.error }
    else if (data?.data?.trainings) {
      const r = data.data.trainings
      trainings.value = (r.result || []).map((t: any) => ({
        id: t.id, name: t.name, problemCount: t.problemCount || 0, markCount: t.markCount || 0,
        acCount: data.data.acCounts?.[t.id] || 0,
      }))
    } else { errorMsg.value = '数据格式不匹配' }
  } catch (e: any) { errorMsg.value = friendlyError(e) }
  finally { loading.value = false }
}

async function fetchDetail(id: number) {
  detailLoading.value = true
  try {
    const data = await browser.runtime.sendMessage({ contentScriptQuery: 'TRAINING.getDetail', id })
    if (data?.data?.training) {
      const t = data.data.training
      detailName.value = t.name || t.title || ''
      const acSet = new Set<number>()
      if (data.data.acceptedProblems) {
        for (const ap of data.data.acceptedProblems) acSet.add(ap.pid || ap)
      }
      detailProblems.value = (t.problems || []).map((p: any) => ({
        pid: String(p.pid || ''),
        title: p.name || p.title || '',
        submitted: p.submitted || false,
        accepted: p.accepted || acSet.has(Number(p.pid)) || false,
      }))
    }
  } catch {}
  detailLoading.value = false
}

function openTraining(id: number) { window.open(`https://www.luogu.com.cn/training/${id}`, '_blank') }
function openProblem(pid: string) { window.open(`https://www.luogu.com.cn/problem/${pid}`, '_blank') }

function loadTrainingContent() {
  if (trainingId.value) { detail.value = null; fetchDetail(trainingId.value) }
  else { detail.value = null; trainings.value = []; currentPage.value = 1; fetchTrainings() }
}
onMounted(loadTrainingContent)
watch(trainingId, () => loadTrainingContent())
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <!-- Detail View -->
    <template v-if="trainingId">
      <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
        <button @click="backToList" style="background:none;border:none;cursor:pointer;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)" mb-2>← 返回题单列表</button>
        <h1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">{{ detailName || '加载中...' }}</h1>
      </div>
      <Loading v-if="detailLoading" />
      <Transition name="content-reveal">
        <div v-if="!detailLoading && detailProblems.length>0" bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)" overflow="hidden">
          <div v-for="(p, idx) in detailProblems" :key="p.pid" class="stagger-row hover:bg-$bew-fill-2" :style="{'--row-index':idx}" flex="~ items-center" p="x-6 y-3.5" border="b-1 $bew-border-color" cursor="pointer" duration-200 @click="openProblem(p.pid)">
            <span style="font-size:var(--bew-base-font-size);color:var(--bew-text-3);font-family:monospace;width:80px;flex-shrink:0">{{ p.pid }}</span>
            <span flex-1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500">{{ p.title }}</span>
            <span v-if="p.accepted" style="color:var(--bew-success-color);font-size:var(--bew-base-font-size)" flex="~ items-center gap-1"><span v-html="renderIcon('mingcute:check-circle-fill',16)" style="display:contents"/> AC</span>
            <span v-else-if="p.submitted" style="color:var(--bew-error-color);font-size:var(--bew-base-font-size)">WA</span>
          </div>
        </div>
      </Transition>
    </template>

    <!-- List View -->
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
</style>
