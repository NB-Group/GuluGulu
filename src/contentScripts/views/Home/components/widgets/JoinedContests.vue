<script setup lang="ts">
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'
import { renderIcon } from '~/utils/icons'

const props = defineProps<{ size?: 'sm' | 'md' | 'lg' }>()
const { navigateTo } = useGuluApp()

interface C { id: number; name: string; startTime: number; endTime: number; status: number }
const list = ref<C[]>([])
const loading = ref(true)

async function fetchList() {
  loading.value = true
  try {
    const res = await fetch(`${location.origin}/user/mine/contestJoined`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const raw = ctx?.data?.contests || []
      const arr: any[] = Array.isArray(raw) ? raw : (raw.result || [])
      const now = Math.floor(Date.now() / 1000)
      list.value = arr.map((c: any) => {
        let status = 0
        if (c.startTime && c.endTime) {
          if (now >= c.endTime) status = 2
          else if (now >= c.startTime) status = 1
        }
        return { id: c.id, name: c.name || c.title || '', startTime: c.startTime || 0, endTime: c.endTime || 0, status }
      })
    }
  }
  catch (e) { console.warn('[GuluGulu]', e) }
  loading.value = false
}

function sLabel(s: number) { return s === 1 ? '进行中' : s === 2 ? '已结束' : '未开始' }
function sColor(s: number) { return s === 1 ? 'var(--bew-success-color)' : s === 2 ? 'var(--bew-text-4)' : 'var(--bew-theme-color)' }
function fmt(ts: number) { const d = new Date(ts * 1000); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
function open(id: number) { navigateTo(AppPage.ContestDetail, `${location.origin}/contest/${id}`) }
const limit = computed(() => props.size === 'lg' ? 6 : props.size === 'sm' ? 2 : 4)
onMounted(fetchList)
defineExpose({ initData: fetchList })
</script>

<template>
  <Loading v-if="loading" />
  <div v-else flex="~ col gap-2">
    <button
      v-for="c in list.slice(0, limit)" :key="c.id"
      class="start-row" flex="~ items-center gap-2" bg="$bew-fill-1" rounded="8px" p="x-3 y-2"
      border="1 solid transparent" cursor-pointer text-left @click="open(c.id)"
    >
      <span style="font-size:.68em;font-weight:700;flex-shrink:0;padding:1px 6px;border-radius:999px" :style="{ background: `color-mix(in srgb, ${sColor(c.status)} 16%, transparent)`, color: sColor(c.status) }">{{ sLabel(c.status) }}</span>
      <span flex-1 min-w-0 style="font-size:.85em;color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.name }}</span>
      <span style="font-size:.72em;color:var(--bew-text-3);flex-shrink:0;white-space:nowrap">{{ fmt(c.startTime) }}</span>
    </button>
    <div v-if="list.length === 0" flex="~ col items-center gap-1" py-6>
      <span style="display:contents" v-html="renderIcon('mingcute:trophy-line', 22)" />
      <span style="color:var(--bew-text-4);font-size:.85em">没有已报名的比赛</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.start-row {
  transition: border-color var(--bew-dur-fast) ease, background var(--bew-dur-fast) ease, transform var(--bew-dur-fast) ease;
  &:hover { border-color: var(--bew-theme-color-40); transform: translateX(2px); }
}
</style>
