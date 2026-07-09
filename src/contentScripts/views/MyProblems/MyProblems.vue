<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'
import { friendlyError } from '~/utils/luogu-api'

interface ProblemItem {
  pid: string; title: string; difficulty: number; passedCount: number; submittedCount: number
}
const items = ref<ProblemItem[]>([])
const loading = ref(true); const errorMsg = ref('')
const totalCount = ref(0)

onMounted(async () => {
  try {
    const res = await fetch('https://www.luogu.com.cn/user/mine/problem', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const r = ctx?.data?.problems
      items.value = r?.result || []
      totalCount.value = r?.count || items.value.length
    } else { errorMsg.value = '请先登录洛谷' }
  } catch (e: any) { errorMsg.value = friendlyError(e) }
  loading.value = false
})

const diffColors: Record<number,string> = {0:'#909399',1:'#bfbfbf',2:'#52c41a',3:'#3498db',4:'#f39c12',5:'#e74c3c',6:'#9b59b6',7:'#262626'}
const diffLabels: Record<number,string> = {0:'暂无评定',1:'入门',2:'普及−',3:'普及/提高−',4:'普及+/提高',5:'提高+/省选−',6:'省选/NOI−',7:'NOI/NOI+/CTSC'}
function openProblem(pid: string) { window.open('https://www.luogu.com.cn/problem/'+pid, '_blank') }
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16">
    <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color">
      <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:700">我的题库</h1>
      <p text="$bew-text-2" mt-1>共 {{ totalCount }} 题</p>
    </div>
    <Loading v-if="loading" />
    <div v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 text="center $bew-text-2" border="1 $bew-border-color">
      <span v-html="renderIcon('mingcute:warning-line',32)" style="display:contents"/><p mt-2>{{ errorMsg }}</p>
    </div>
    <Transition name="content-reveal">
      <div v-if="!loading && items.length>0" bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" overflow="hidden">
        <div v-for="(p, idx) in items" :key="p.pid" class="stagger-row hover:bg-$bew-fill-2" :style="{'--row-index':idx}" flex="~ items-center" p="x-6 y-3.5" border="b-1 $bew-border-color" cursor="pointer" @click="openProblem(p.pid)">
          <span style="width:80px;font-size:var(--bew-base-font-size);color:var(--bew-text-3);font-family:monospace;flex-shrink:0">{{ p.pid }}</span>
          <span flex-1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500">{{ p.title }}</span>
          <span text="xs" px-2 py-0.5 rounded-full shrink-0 :style="{background:diffColors[p.difficulty||0]+'20',color:diffColors[p.difficulty||0]}">{{ diffLabels[p.difficulty||0] || '未知' }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>
