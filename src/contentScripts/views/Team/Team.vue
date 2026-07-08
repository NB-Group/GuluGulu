<script setup lang="ts">
import { renderIcon } from '~/utils/icons'

interface TeamInfo {
  id: number; name: string; isPremium: boolean; type: number; memberCount: number
  createTime: number; master?: { uid: number; avatar: string; name: string; color: string }
  description: string; openness: number
}
interface Discussion {
  id: number; title: string; author: { uid: number; avatar: string; name: string; color: string }
  time: number; replyCount: number; topped: boolean
}

const teams = ref<TeamInfo[]>([])
const loading = ref(true)
const errorMsg = ref('')

// Detail view
const teamId = computed(() => { const m = document.URL.match(/\/team\/(\d+)/i); return m ? Number(m[1]) : null })
const team = ref<TeamInfo | null>(null)
const currentMember = ref<any>(null)
const discussions = ref<Discussion[]>([])
const notice = ref('')
const detailLoading = ref(false)
const detailError = ref('')

async function fetchTeamList() {
  loading.value = true; errorMsg.value = ''
  try {
    const res = await fetch('https://www.luogu.com.cn/user/mine/team?_contentOnly=1', { credentials: 'same-origin' })
    const json = await res.json()
    const list: any[] = json?.currentData?.teams || json?.data?.teams || []
    teams.value = list.map((t: any) => ({
      id: t.team?.id || t.id, name: t.team?.name || t.name || '',
      isPremium: t.team?.isPremium || false, type: t.type || t.team?.type || 1,
      memberCount: t.team?.memberCount || 0, createTime: t.team?.createTime || 0,
      master: t.team?.master, description: '', openness: 0,
    }))
  } catch (e: any) { errorMsg.value = e.message }
  loading.value = false
}

async function fetchTeamDetail(id: number) {
  detailLoading.value = true; detailError.value = ''
  try {
    const res = await fetch(`https://www.luogu.com.cn/team/${id}?_contentOnly=1`, { credentials: 'same-origin' })
    const json = await res.json()
    const cd = json?.currentData || json?.data || {}
    if (cd.team) {
      team.value = {
        id: cd.team.id, name: cd.team.name, isPremium: cd.team.isPremium, type: cd.team.type,
        memberCount: cd.team.memberCount || 0, createTime: cd.team.createTime || 0,
        master: cd.team.master, description: cd.team.description || '',
        openness: cd.team.openness || 0,
      }
      currentMember.value = cd.currentMember || null
      discussions.value = (cd.latestDiscussions || []).map((d: any) => ({
        id: d.id, title: d.title, author: d.author, time: d.time, replyCount: d.replyCount || 0, topped: d.topped,
      }))
      notice.value = cd.notice || ''
    }
  } catch {}
  detailLoading.value = false
}

function openTeam(id: number) { window.location.href = `https://www.luogu.com.cn/team/${id}` }
function openUser(uid: number) { window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank') }
function openPost(id: number) { window.location.href = `https://www.luogu.com.cn/discuss/${id}` }
function backToTeams() { window.location.href = 'https://www.luogu.com.cn/user/mine/team' }
function timeAgo(ts: number): string {
  const d = Math.floor(Date.now() / 1000) - ts
  if (d < 3600) return `${Math.floor(d / 60)}分前`
  if (d < 86400) return `${Math.floor(d / 3600)}时前`
  return `${Math.floor(d / 86400)}天前`
}
function formatDate(ts: number): string { return new Date(ts * 1000).toLocaleDateString('zh-CN') }
function typeLabel(t: number): string { return t === 2 ? '教学' : t === 1 ? '比赛' : '普通' }

onMounted(() => { teamId.value ? fetchTeamDetail(teamId.value) : fetchTeamList() })
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <Loading v-if="loading" />

    <!-- ============================================================ -->
    <!-- Detail View -->
    <!-- ============================================================ -->
    <Transition name="content-reveal">
      <div v-if="!loading && teamId && team" w-full>
        <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <button @click="backToTeams" style="background:none;border:none;cursor:pointer;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)" mb-3>← 返回团队列表</button>

          <div flex="~ items-center gap-4" mb-3>
            <div w="56px" h="56px" rounded="12px" bg="$bew-theme-color-20" flex="~ items-center justify-center" style="font-size:1.5rem;color:var(--bew-theme-color);font-weight:700">
              {{ team.name.charAt(0) }}
            </div>
            <div flex="1">
              <h1 style="font-size:1.25rem;font-weight:700;color:var(--bew-text-1)">{{ team.name }}</h1>
              <div flex="~ gap-2" mt-1 style="font-size:.85em;color:var(--bew-text-3)">
                <span>{{ typeLabel(team.type) }}团队</span>
                <span v-if="team.isPremium" style="color:var(--bew-warning-color);font-weight:600">Premium</span>
                <span>{{ team.memberCount }} 名成员</span>
                <span>创建于 {{ formatDate(team.createTime) }}</span>
              </div>
            </div>
          </div>

          <div v-if="team.master" flex="~ items-center gap-2" mb-3>
            <span style="font-size:.85em;color:var(--bew-text-3)">团长:</span>
            <img :src="team.master.avatar" style="width:22px;height:22px;border-radius:50%;cursor:pointer" @click="openUser(team.master.uid)" @error="(e:any) => e.target.style.display='none'" />
            <span :style="{ color: `var(--bew-${team.master.color})`, fontWeight: 600, fontSize: '.9em', cursor: 'pointer' }" @click="openUser(team.master.uid)">{{ team.master.name }}</span>
          </div>

          <div v-if="currentMember" px-3 py-1 rounded-full inline-block style="font-size:.8em" :style="{ background: 'var(--bew-success-color-20)', color: 'var(--bew-success-color)' }">已加入</div>
        </div>

        <!-- Discussions -->
        <div v-if="discussions.length > 0" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <h2 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)" mb-3>最新讨论</h2>
          <div v-for="d in discussions" :key="d.id" flex="~ items-center gap-3" p-2 rounded="8px" cursor-pointer class="discuss-row" @click="openPost(d.id)">
            <img :src="d.author.avatar" style="width:24px;height:24px;border-radius:50%;flex-shrink:0" @error="(e:any) => e.target.style.display='none'" />
            <div flex="1" min-w-0>
              <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ d.title }}</div>
              <div style="font-size:.75em;color:var(--bew-text-3)">{{ d.author.name }} · {{ timeAgo(d.time) }} · {{ d.replyCount }} 回复</div>
            </div>
          </div>
        </div>

        <div v-if="detailLoading" text="center" p-8><Loading /></div>
      </div>
    </Transition>

    <!-- ============================================================ -->
    <!-- List View -->
    <!-- ============================================================ -->
    <Transition name="content-reveal">
      <div v-if="!loading && !teamId" w-full>
        <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <h1 style="font-size:1.25rem;font-weight:700;color:var(--bew-text-1)" mb-2>我的团队</h1>
          <p style="font-size:var(--bew-base-font-size);color:var(--bew-text-2)">共 {{ teams.length }} 个团队</p>
        </div>

        <div v-if="errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" style="text-align:center;color:var(--bew-text-2)">
          <span v-html="renderIcon('mingcute:warning-line', 32)" style="display:contents"/><p mt-2>{{ errorMsg }}</p>
        </div>

        <div v-if="!errorMsg && teams.length === 0" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" style="text-align:center;color:var(--bew-text-3);font-size:var(--bew-base-font-size)" flex="~ col items-center" gap-3>
          <span v-html="renderIcon('mingcute:team-line', 48)" style="display:contents" />
          <p>暂未加入任何团队</p>
        </div>

        <div v-if="teams.length > 0" grid="~ cols-1 md:cols-2 xl:cols-3" gap-4>
          <div v-for="t in teams" :key="t.id" bg="$bew-content" rounded="$bew-radius" p-5 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" cursor="pointer" class="team-card" style="backdrop-filter:var(--bew-filter-glass-1)" @click="openTeam(t.id)">
            <div flex="~ items-center gap-3" mb-3>
              <div w="44px" h="44px" rounded="10px" bg="$bew-theme-color-20" flex="~ items-center justify-center" style="font-size:1.2rem;color:var(--bew-theme-color);font-weight:700">
                {{ t.name.charAt(0) }}
              </div>
              <div flex="1" min-w-0>
                <div style="font-size:var(--bew-base-font-size);font-weight:600;color:var(--bew-text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ t.name }}</div>
                <div style="font-size:.8em;color:var(--bew-text-3)">{{ typeLabel(t.type) }} · {{ t.memberCount }} 名成员</div>
              </div>
              <span v-if="t.isPremium" style="font-size:.7em;background:var(--bew-warning-color-20);color:var(--bew-warning-color);padding:1px 8px;border-radius:999px;font-weight:600">Premium</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.team-card { transition: box-shadow .2s, transform .2s; }
.team-card:hover { box-shadow: var(--bew-shadow-2)!important; transform: translateY(-2px); }
.discuss-row:hover { background: var(--bew-fill-2); }
</style>
