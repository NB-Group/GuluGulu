<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'

const { navigateTo } = useGuluApp()

interface Problem {
  pid: string; title: string; difficulty: number
  accepted: number; submitted: number
}

const problems = ref<Problem[]>([])
const loading = ref(true)

import { diffLabel, diffColor } from '~/utils/difficulty'

async function fetchProblems() {
  loading.value = true
  try {
    // /problem/list?_contentOnly=1 对列表页返回的是 HTML(非 JSON),要 fetch 页面 + 正则抽 lentille-context
    const res = await fetch('https://www.luogu.com.cn/problem/list', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    const ctx = m?.[1] ? JSON.parse(m[1]) : null
    const list: any[] = ctx?.data?.problems?.result || ctx?.currentData?.problems?.result || []
    problems.value = list.slice(0, 12).map((p: any) => ({
      pid: p.pid || '', title: p.name || p.title || '', difficulty: p.difficulty || 1,
      accepted: p.totalAccepted || p.acceptedCount || 0, submitted: p.totalSubmit || p.submittedCount || 1,
    }))
  } catch (e) { console.warn('[GuluGulu]', e) }
  loading.value = false
}

function passRate(a: number, s: number) { return s > 0 ? Math.round((a / s) * 100) : 0 }
function openProblem(pid: string) { navigateTo(AppPage.ProblemDetail, `https://www.luogu.com.cn/problem/${pid}`) }

onMounted(fetchProblems)
</script>

<template>
  <div>
    <div style="backdrop-filter:var(--bew-filter-glass-1)" bg="$bew-content" rounded="12px" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 solid $bew-border-color" p="16px" mb="16px">
      <div mb-4 flex="~ items-center gap-2">
        <span v-html="renderIcon('mingcute:fire-line', 20)" style="display:contents;color:var(--bew-theme-color)" />
        <div>
          <h2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">热门题目</h2>
          <p style="font-size:.85em;color:var(--bew-text-3)" mt-1>洛谷题库</p>
        </div>
      </div>
      <Loading v-if="loading" />
      <Transition name="content-reveal">
        <div v-if="!loading" grid="~ cols-1 md:cols-2 lg:cols-3" gap-4>
        <div v-for="(p, idx) in problems" :key="p.pid" class="stagger-row problem-card" :style="{'--row-index': idx}" bg="$bew-fill-1" rounded="8px" p-3 cursor-pointer shadow="[var(--bew-shadow-1)]" border="1 solid $bew-border-color" duration-300 @click="openProblem(p.pid)">
          <div flex="~ items-center justify-between" mb-2>
            <span style="font-size:.85em;color:var(--bew-text-3)" font-mono>{{ p.pid }}</span>
            <span style="font-size:.75em" px-2 py-1 rounded-full fw-600 :style="{ color: diffColor(p.difficulty), background: `${diffColor(p.difficulty)}20` }">{{ diffLabel(p.difficulty) }}</span>
          </div>
          <h3 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600" mb-2>{{ p.title }}</h3>
          <div flex="~ items-center gap-1" style="font-size:.8em;color:var(--bew-text-3)">
            <span v-html="renderIcon('mingcute:check-circle-line', 14)" style="display:contents" /> 通过率 {{ passRate(p.accepted, p.submitted) }}%
          </div>
        </div>
        <div v-if="problems.length === 0" style="text-align:center;color:var(--bew-text-3);font-size:var(--bew-base-font-size)" py-8>获取题目失败</div>
      </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 内层卡片不再自带 backdrop-filter:外层「热门题目」面板已是 glass,
   子元素再 blur 会形成嵌套毛玻璃,入场时采样错乱闪亮。内层只用半透明 bg 即可。 */
.problem-card { transition: box-shadow var(--bew-dur-fast) ease, transform var(--bew-dur-fast) ease; }
.problem-card:hover { box-shadow: var(--bew-shadow-2) !important; transform: translateY(-2px); }
</style>
