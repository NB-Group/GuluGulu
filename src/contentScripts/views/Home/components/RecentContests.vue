<script setup lang="ts">
interface Contest {
  id: number; name: string; startTime: number; endTime: number
  status: number; type: string; rated: boolean; host?: { name: string }
}

const contests = ref<Contest[]>([])
const loading = ref(true)

async function fetchContests() {
  loading.value = true
  try {
    const res = await fetch('https://www.luogu.com.cn/contest/list', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const list: any[] = ctx?.data?.contests?.result || []
      const now = Math.floor(Date.now() / 1000)
      const METHOD: Record<number, string> = { 1: 'OI', 2: 'ICPC', 3: '乐多', 4: 'IOI' }
      contests.value = list.slice(0, 8).map((c: any) => {
        let status = 0
        if (c.startTime && c.endTime) {
          if (now >= c.endTime) status = 2
          else if (now >= c.startTime) status = 1
        }
        return {
          id: c.id, name: c.name || c.title || '', startTime: c.startTime || 0,
          endTime: c.endTime || 0, status,
          type: METHOD[c.method] || c.ruleType || c.type || 'OI',
          rated: c.rated === 1 || c.rated === true,
          host: c.host,
        }
      })
    }
  } catch {}
  loading.value = false
}

function sLabel(s: number): string { if (s === 1) return '进行中'; if (s === 2) return '已结束'; return '未开始' }
function sColor(s: number): string { if (s === 1) return '#52c41a'; if (s === 2) return '#909399'; return '#1890ff' }
function fmt(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function openContest(id: number) { window.open(`https://www.luogu.com.cn/contest/${id}`, '_blank') }

onMounted(fetchContests)
</script>

<template>
  <div>
    <div style="backdrop-filter:var(--bew-filter-glass-1)" bg="$bew-content" rounded="12px" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 solid $bew-border-color" p="16px" mb="16px">
      <div mb-4>
        <h2 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">近期比赛</h2>
        <p style="font-size:.85em;color:var(--bew-text-3)" mt-1>即将开始和进行中的比赛</p>
      </div>
      <Loading v-if="loading" />
      <Transition name="content-reveal">
        <div v-if="!loading" flex="~ col" gap-3>
        <div v-for="(c, idx) in contests" :key="c.id" class="stagger-row contest-row" :style="{'--row-index': idx}" bg="$bew-fill-1" rounded="8px" p-3 cursor-pointer shadow="[var(--bew-shadow-1)]" border="1 solid $bew-border-color" duration-300 @click="openContest(c.id)">
          <div flex="~ items-center gap-2" flex-wrap mb-2>
            <span style="font-size:.75em" fw-bold px-2 py-0.5 rounded-full :style="{ background: sColor(c.status) + '20', color: sColor(c.status) }">{{ sLabel(c.status) }}</span>
            <span style="font-size:.75em;color:var(--bew-theme-color)" fw-bold px-2 py-0.5 rounded-full bg="$bew-theme-color-20">{{ c.type }}</span>
            <span v-if="c.rated" style="font-size:.75em;background:var(--bew-warning-color-20);color:var(--bew-warning-color)" fw-bold px-2 py-0.5 rounded-full>Rated</span>
          </div>
          <h3 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600" mb-1>{{ c.name }}</h3>
          <div style="font-size:.8em;color:var(--bew-text-3)">
            <span v-if="c.host?.name">主办: {{ c.host.name }} | </span>
            <span>{{ fmt(c.startTime) }} — {{ fmt(c.endTime) }}</span>
          </div>
        </div>
        <div v-if="contests.length === 0" style="text-align:center;color:var(--bew-text-3);font-size:var(--bew-base-font-size)" py-8>暂无比赛</div>
      </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped lang="scss">
.contest-row { transition: box-shadow 200ms ease, transform 200ms ease; backdrop-filter: var(--bew-filter-glass-1); }
.contest-row:hover { box-shadow: var(--bew-shadow-2) !important; transform: translateY(-2px); }
</style>
