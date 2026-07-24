<script setup lang="ts">
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'

const props = defineProps<{ w?: number, h?: number }>()
const { navigateTo } = useGuluApp()

interface Draft { pid: string; ts: number; preview: string }
const drafts = ref<Draft[]>([])
const loading = ref(true)

function fetchDrafts() {
  loading.value = true
  try {
    const out: Draft[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith('gulu:code:'))
        continue
      const pid = k.slice('gulu:code:'.length)
      try {
        const v = JSON.parse(localStorage.getItem(k) || '{}')
        if (typeof v.code === 'string' && v.code.trim()) {
          // preview:第一行非空注释/代码,截断
          const firstLine = v.code.split('\n').find((l: string) => l.trim()) || ''
          out.push({ pid, ts: v.ts || 0, preview: firstLine.replace(/^(\/\/|#|\/\*|\*).*?/, '').trim().slice(0, 40) || `${pid} 草稿` })
        }
      }
      catch {}
    }
    out.sort((a, b) => b.ts - a.ts)
    drafts.value = out
  }
  catch (e) { console.warn('[GuluGulu]', e) }
  loading.value = false
}

function rel(ts: number): string {
  if (!ts) return ''
  const dt = Date.now() - ts
  const m = Math.floor(dt / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

function open(pid: string) { navigateTo(AppPage.ProblemDetail, `${location.origin}/problem/${pid}`) }
const limit = computed(() => Math.max(2, (props.h || 3) * 2))
onMounted(fetchDrafts)
defineExpose({ initData: fetchDrafts })
</script>

<template>
  <Loading v-if="loading" />
  <div v-else flex="~ col gap-2">
    <button
      v-for="d in drafts.slice(0, limit)" :key="d.pid"
      class="start-row"
      flex="~ items-center gap-2" bg="$bew-fill-1" rounded="8px" p="x-3 y-2"
      border="1 solid transparent" cursor-pointer text-left
      @click="open(d.pid)"
    >
      <span style="font-family:monospace;font-size:.8em;color:var(--bew-theme-color);min-width:64px;flex-shrink:0">{{ d.pid }}</span>
      <span flex-1 min-w-0 style="font-size:.82em;color:var(--bew-text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ d.preview }}</span>
      <span v-if="d.ts" style="font-size:.7em;color:var(--bew-text-4);flex-shrink:0">{{ rel(d.ts) }}</span>
    </button>
    <div v-if="drafts.length === 0" style="text-align:center;color:var(--bew-text-4);font-size:.85em" py-6>
      没有未完成的草稿
    </div>
  </div>
</template>

<style scoped lang="scss">
.start-row {
  transition: border-color var(--bew-dur-fast) ease, background var(--bew-dur-fast) ease, transform var(--bew-dur-fast) ease;
  &:hover { border-color: var(--bew-theme-color-40); transform: translateX(2px); }
}
</style>
