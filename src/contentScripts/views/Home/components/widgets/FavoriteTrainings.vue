<script setup lang="ts">
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'
import { renderIcon } from '~/utils/icons'

const props = defineProps<{ size?: 'sm' | 'md' | 'lg' }>()
const { navigateTo } = useGuluApp()

interface T { id: number; name: string; markCount: number }
const list = ref<T[]>([])
const loading = ref(true)

async function fetchList() {
  loading.value = true
  try {
    const res = await fetch(`${location.origin}/user/mine/trainingFav`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const raw = ctx?.data?.trainings || []
      const arr: any[] = Array.isArray(raw) ? raw : (raw.result || [])
      list.value = arr.map((t: any) => ({ id: t.id, name: t.name || t.title || '', markCount: t.markCount || 0 }))
    }
  }
  catch (e) { console.warn('[GuluGulu]', e) }
  loading.value = false
}

function open(id: number) { navigateTo(AppPage.Training, `${location.origin}/training/${id}`) }
const limit = computed(() => props.size === 'lg' ? 6 : props.size === 'sm' ? 2 : 4)
onMounted(fetchList)
defineExpose({ initData: fetchList })
</script>

<template>
  <Loading v-if="loading" />
  <div v-else flex="~ col gap-2">
    <button
      v-for="t in list.slice(0, limit)" :key="t.id"
      class="start-row" flex="~ items-center gap-2" bg="$bew-fill-1" rounded="8px" p="x-3 y-2"
      border="1 solid transparent" cursor-pointer text-left @click="open(t.id)"
    >
      <span style="display:contents;color:var(--bew-warning-color)" v-html="renderIcon('mingcute:star-fill', 14)" />
      <span flex-1 min-w-0 style="font-size:.85em;color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ t.name }}</span>
      <span style="font-size:.72em;color:var(--bew-text-3);flex-shrink:0">{{ t.markCount }} 收藏</span>
    </button>
    <div v-if="list.length === 0" flex="~ col items-center gap-1" py-6>
      <span style="display:contents" v-html="renderIcon('mingcute:star-line', 22)" />
      <span style="color:var(--bew-text-4);font-size:.85em">还没有收藏的题单</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.start-row {
  transition: border-color var(--bew-dur-fast) ease, background var(--bew-dur-fast) ease, transform var(--bew-dur-fast) ease;
  &:hover { border-color: var(--bew-theme-color-40); transform: translateX(2px); }
}
</style>
