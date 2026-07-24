<script setup lang="ts">
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'
import { renderIcon } from '~/utils/icons'
import { friendlyError } from '~/utils/luogu-api'

interface Contest {
  id: number; name: string; startTime: number; endTime: number; status: string
  type: string; rated: boolean; host?: { name: string }
}

const { navigateTo } = useGuluApp()
const contests = ref<Contest[]>([])
const loading = ref(true); const errorMsg = ref('')
const totalCount = ref(0)

async function fetchContests() {
  loading.value = true; errorMsg.value = ''
  try {
    const data = await browser.runtime.sendMessage({ contentScriptQuery: 'CONTEST.getList' })
    if (data?.error) { errorMsg.value = data.error }
    else if (data?.__needLogin) { errorMsg.value = '需要登录洛谷才能查看' }
    else if (data?.data?.contests) {
      const r = data.data.contests
      contests.value = (r.result || []).map((c: any) => ({
        id: c.id, name: c.name || c.title || '', startTime: c.startTime || 0,
        endTime: c.endTime || 0, status: c.status || 'upcoming',
        type: c.type || 'OI', rated: c.rated || false, host: c.host,
      }))
      totalCount.value = r.count || contests.value.length
    } else { errorMsg.value = '数据格式不匹配' }
  } catch (e: any) { errorMsg.value = friendlyError(e) }
  finally { loading.value = false }
}

function openContest(id: number) { navigateTo(AppPage.ContestDetail, `${location.origin}/contest/${id}`) }
function getContestStatus(c: any): { label: string; color: string } {
  const now = Math.floor(Date.now() / 1000)
  if (c.startTime && now < c.startTime) return { label: '即将开始', color: 'var(--bew-success-color)' }
  if (c.endTime && now < c.endTime) return { label: '进行中', color: 'var(--bew-error-color)' }
  return { label: '已结束', color: 'var(--bew-text-4)' }
}
function timeStr(ts: number) { return new Date(ts * 1000).toLocaleDateString('zh-CN') }

onMounted(fetchContests)
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
      <h1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700" mb-2 flex="~ items-center gap-2">
        <span style="display:contents;color:var(--bew-theme-color)" v-html="renderIcon('mingcute:trophy-line', 18)" />
        比赛
      </h1>
      <p style="font-size:var(--bew-base-font-size);color:var(--bew-text-2)">共 {{ totalCount }} 场比赛</p>
    </div>

    <Loading v-if="loading" />
    <div v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" text="center $bew-text-2">
      <span v-html="renderIcon('mingcute:warning-line',32)" style="display:contents"/><p mt-2>{{ errorMsg }}</p>
    </div>

    <Transition name="content-reveal">
      <TransitionGroup v-if="!loading && contests.length>0" name="flip-list" tag="div" grid="~ cols-1 md:cols-2 xl:cols-3" gap-4 mb-6>
        <div v-for="(c, idx) in contests" :key="c.id" class="stagger-card contest-card" :style="{ '--card-index': idx, backdropFilter: 'var(--bew-filter-glass-1)' }" bg="$bew-content" rounded="$bew-radius" p-5 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" cursor="pointer" @click="openContest(c.id)">
          <div flex="~ items-center justify-between" mb-3>
            <span :style="{background:`${getContestStatus(c).color}20`,color:getContestStatus(c).color,fontSize:'var(--bew-base-font-size)',fontWeight:600,padding:'2px 10px',borderRadius:'9999px'}">{{ getContestStatus(c).label }}</span>
            <span v-if="c.rated" style="font-size:var(--bew-base-font-size);color:var(--bew-success-color);font-weight:600">Rated</span>
          </div>
          <h3 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600" mb-3>{{ c.name }}</h3>
          <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-2)">
            <span>{{ timeStr(c.startTime) }} — {{ timeStr(c.endTime) }}</span>
          </div>
        </div>
      </TransitionGroup>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.contest-card { transition:box-shadow var(--bew-dur-fast),transform var(--bew-dur-fast) }
.contest-card:hover { box-shadow:var(--bew-shadow-2)!important;transform:translateY(-2px) }
</style>
