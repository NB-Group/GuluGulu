<script setup lang="ts">
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'
import { renderIcon } from '~/utils/icons'
import { friendlyError } from '~/utils/luogu-api'

const { navigateTo } = useGuluApp()
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const items = ref<any[]>([])
const loading = ref(true); const errorMsg = ref('')

onMounted(async () => {
  try {
    const res = await fetch(location.origin + '/user/mine/trainingFav', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const raw = JSON.parse(m[1])?.data?.trainings
      items.value = Array.isArray(raw) ? raw : (raw?.result || [])
    } else errorMsg.value = '请先登录洛谷'
  } catch (e: any) { errorMsg.value = friendlyError(e) }
  loading.value = false
})

function openTraining(id: number) { navigateTo(AppPage.Training, location.origin + '/training/'+id) }
</script>

<template>
  <div :class="{ 'page-container': !props.embedded }" w-full h-full :p="props.embedded ? '' : 'x-4 md:x-8 lg:x-16'">
    <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" v-if="!props.embedded">
      <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:700">我的收藏</h1>
    </div>
    <Loading v-if="loading" />
    <div v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 text="center $bew-text-2" border="1 $bew-border-color">
      <span v-html="renderIcon('mingcute:warning-line',32)" style="display:contents"/><p mt-2>{{ errorMsg }}</p>
    </div>
    <Transition name="content-reveal">
      <div v-if="!loading && items.length>0" grid="~ cols-1 md:cols-2 xl:cols-3" gap-4>
        <div v-for="t in items" :key="t.id" class="card" bg="$bew-content" rounded="$bew-radius" p-5 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" cursor="pointer" style="backdrop-filter:var(--bew-filter-glass-1)" @click="openTraining(t.id)">
          <h3 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600" mb-2>{{ t.name }}</h3>
          <div style="font-size:.85em;color:var(--bew-text-2)">
            <span v-if="t.problemCount">{{ t.problemCount }} 题</span>
            <span v-if="t.markCount"> · {{ t.markCount }} 收藏</span>
          </div>
        </div>
      </div>
    </Transition>
    <div v-if="!loading && !errorMsg && items.length===0" bg="$bew-content" rounded="$bew-radius" p-8 text="center $bew-text-3" border="1 $bew-border-color">
      <span v-html="renderIcon('mingcute:bookmark-line',48)" style="display:contents"/><p mt-2>暂无收藏</p>
    </div>
  </div>
</template>

<style scoped>
.card { transition: box-shadow var(--bew-dur-fast), transform var(--bew-dur-fast); }
.card:hover { box-shadow: var(--bew-shadow-2)!important; transform: translateY(-2px); }
</style>
