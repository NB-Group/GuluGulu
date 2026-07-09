<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'
import { friendlyError } from '~/utils/luogu-api'
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'

const { currentUrl, navigateTo } = useGulyApp()

interface TeamInfo {
  id: number; name: string; isPremium: boolean; type: number; memberCount: number
  createTime: number; master?: { uid: number; avatar: string; name: string; color: string }
  description: string; openness: number
}
interface Discussion {
  id: number; title: string; author: { uid: number; avatar: string; name: string; color: string }
  time: number; replyCount: number; topped: boolean
}

// ============================================================
// List view state
// ============================================================
const teams = ref<TeamInfo[]>([])
const joinRequests = ref<any[]>([])
const loading = ref(true)
const errorMsg = ref('')
const activeTab = ref<'joined' | 'created'>('joined')

// ============================================================
// Detail view state
// ============================================================
const teamId = computed(() => { const m = currentUrl.value.match(/\/team\/(\d+)/i); return m ? Number(m[1]) : null })
const team = ref<TeamInfo | null>(null)
const currentMember = ref<any>(null)
const discussions = ref<Discussion[]>([])
const groups = ref<any[]>([])
const notice = ref('')
const detailLoading = ref(false)

// ============================================================
// Fetch team list
// ============================================================
async function fetchTeamList() {
  loading.value = true; errorMsg.value = ''
  try {
    const res = await fetch('https://www.luogu.com.cn/user/mine/team', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const cd = ctx?.data || ctx?.currentData || {}
      teams.value = (cd.teams?.result || []).map((t: any) => ({
        id: t.team?.id || t.id, name: t.team?.name || t.name || '',
        isPremium: t.team?.isPremium || false, type: t.type || t.team?.type || 1,
        memberCount: t.team?.memberCount || 0, createTime: t.team?.createTime || 0,
        master: t.team?.master, description: '', openness: 0,
      }))
      joinRequests.value = cd.joinRequests?.result || []
    } else { errorMsg.value = '请先登录洛谷' }
  } catch (e: any) { errorMsg.value = friendlyError(e) }
  loading.value = false
}

// ============================================================
// Fetch team detail
// ============================================================
async function fetchTeamDetail(id: number) {
  detailLoading.value = true
  try {
    const res = await fetch(`https://www.luogu.com.cn/team/${id}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const cd = ctx?.data || ctx?.currentData || {}
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
        groups.value = cd.groups || []
        notice.value = cd.notice || ''
      }
    }
  } catch {}
  detailLoading.value = false
}

// ============================================================
// Navigation
// ============================================================
function openTeam(id: number) { navigateTo(AppPage.Team, `https://www.luogu.com.cn/team/${id}`) }
function backToTeams() { navigateTo(AppPage.Team, 'https://www.luogu.com.cn/user/mine/team') }
function openUser(uid: number) { window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank') }
function openPost(id: number) { navigateTo(AppPage.Blog, `https://www.luogu.com.cn/discuss/${id}`) }
function formatDate(ts: number): string { return ts ? new Date(ts * 1000).toLocaleDateString('zh-CN') : '' }
function typeLabel(t: number): string { return t === 2 ? '教学' : t === 1 ? '比赛' : '普通' }

function loadContent() {
  if (teamId.value) { team.value = null; fetchTeamDetail(teamId.value) }
  else { team.value = null; fetchTeamList() }
}
onMounted(loadContent)
watch(teamId, () => loadContent())
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <Loading v-if="loading" />

    <!-- ============================================================ -->
    <!-- Detail View -->
    <!-- ============================================================ -->
    <template v-if="teamId && !loading">
      <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
        <button @click="backToTeams" style="background:none;border:none;cursor:pointer;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)" mb-3>← 返回团队列表</button>
        <div flex="~ items-center gap-4" mb-3>
          <div w="56px" h="56px" rounded="12px" bg="$bew-theme-color-20" flex="~ items-center justify-center" style="font-size:1.5rem;color:var(--bew-theme-color);font-weight:700">{{ team?.name?.charAt(0) || '?' }}</div>
          <div flex="1">
            <h1 style="font-size:1.25rem;font-weight:700;color:var(--bew-text-1)">{{ team?.name }}</h1>
            <div flex="~ gap-2" mt-1 style="font-size:.85em;color:var(--bew-text-3)">
              <span>{{ typeLabel(team?.type || 1) }}团队</span>
              <span v-if="team?.isPremium" style="color:var(--bew-warning-color);font-weight:600">Premium</span>
              <span>{{ team?.memberCount }} 名成员</span>
              <span>创建于 {{ formatDate(team?.createTime || 0) }}</span>
            </div>
          </div>
        </div>
        <div v-if="team?.master" flex="~ items-center gap-2" mb-3>
          <span style="font-size:.85em;color:var(--bew-text-3)">团长:</span>
          <img :src="team.master.avatar" style="width:22px;height:22px;border-radius:50%;cursor:pointer" @click="openUser(team.master.uid)" @error="(e:any) => e.target.style.display='none'" />
          <span :style="{ color: `var(--bew-${team.master.color})`, fontWeight: 600, fontSize: '.9em', cursor: 'pointer' }" @click="openUser(team.master.uid)">{{ team.master.name }}</span>
        </div>
        <div v-if="currentMember" px-3 py-1 rounded-full inline-block style="font-size:.8em" :style="{ background: 'var(--bew-success-color-20)', color: 'var(--bew-success-color)' }">已加入</div>
      </div>

      <Loading v-if="detailLoading" />

      <div v-if="!detailLoading && team">
        <!-- Groups -->
        <div v-if="groups.length > 0" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <h2 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)" mb-3>成员组</h2>
          <div v-for="g in groups" :key="g.id" flex="~ items-center justify-between" p-3 rounded="$bew-radius" bg="$bew-fill-1" mb-2>
            <span style="font-weight:600;color:var(--bew-text-1);font-size:var(--bew-base-font-size)">{{ g.name }}</span>
            <span style="font-size:.85em;color:var(--bew-text-3)">{{ g.memberCount || g.count || 0 }} 人</span>
          </div>
        </div>

        <!-- Discussions -->
        <div v-if="discussions.length > 0" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <h2 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)" mb-3>最新讨论</h2>
          <div v-for="d in discussions" :key="d.id" flex="~ items-center gap-3" p-2 rounded="8px" cursor="pointer" class="discuss-row" @click="openPost(d.id)">
            <img :src="d.author.avatar" style="width:24px;height:24px;border-radius:50%;flex-shrink:0" @error="(e:any) => e.target.style.display='none'" />
            <div flex="1" min-w-0>
              <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ d.title }}</div>
              <div style="font-size:.75em;color:var(--bew-text-3)">{{ d.author.name }} · {{ timeAgo(d.time) }} · {{ d.replyCount }} 回复</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ============================================================ -->
    <!-- List View: Joined / Created tabs -->
    <!-- ============================================================ -->
    <template v-if="!teamId && !loading">
      <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
        <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:700" mb-4>我的团队</h1>

        <!-- Tab bar -->
        <div flex="~ gap-1" bg="$bew-fill-1" rounded="$bew-radius" p-1 mb-4>
          <button v-for="tab in [{k:'joined',l:'已加入'},{k:'created',l:'已创建'}]" :key="tab.k"
            flex-1 px-4 py-2 rounded="$bew-radius-half" border="none" cursor="pointer"
            style="font-size:var(--bew-base-font-size);transition:all .15s"
            :style="activeTab === tab.k ? { background: 'var(--bew-theme-color)', color: 'white', fontWeight: 600 } : { background: 'transparent', color: 'var(--bew-text-2)' }"
            @click="activeTab = tab.k as any"
          >{{ tab.l }} {{ activeTab === tab.k ? `(${teams.length})` : '' }}</button>
        </div>

        <!-- Join requests badge -->
        <div v-if="joinRequests.length > 0" flex="~ items-center gap-2" mb-4 p-3 rounded="$bew-radius" bg="$bew-warning-color-10">
          <span style="font-size:.85em;color:var(--bew-warning-color)">待处理加入申请: {{ joinRequests.length }} 个</span>
        </div>
      </div>

      <div v-if="errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" text="center $bew-text-2">
        <span v-html="renderIcon('mingcute:warning-line', 32)" style="display:contents"/><p mt-2>{{ errorMsg }}</p>
      </div>

      <div v-if="!errorMsg && teams.length === 0" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" text="center $bew-text-3" flex="~ col items-center" gap-3>
        <span v-html="renderIcon('mingcute:team-line', 48)" style="display:contents" />
        <p>暂未加入任何团队</p>
      </div>

      <Transition name="content-reveal">
        <div v-if="teams.length > 0" grid="~ cols-1 md:cols-2 xl:cols-3" gap-4>
          <div v-for="(t, idx) in teams" :key="t.id" class="stagger-card team-card" :style="{ '--card-index': idx, backdropFilter: 'var(--bew-filter-glass-1)' }" bg="$bew-content" rounded="$bew-radius" p-5 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" cursor="pointer" @click="openTeam(t.id)">
            <div flex="~ items-center gap-3" mb-3>
              <div w="44px" h="44px" rounded="10px" bg="$bew-theme-color-20" flex="~ items-center justify-center" style="font-size:1.2rem;color:var(--bew-theme-color);font-weight:700">{{ t.name.charAt(0) }}</div>
              <div flex="1" min-w-0>
                <div style="font-size:var(--bew-base-font-size);font-weight:600;color:var(--bew-text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ t.name }}</div>
                <div style="font-size:.8em;color:var(--bew-text-3)">{{ typeLabel(t.type) }} · {{ t.memberCount }} 名成员</div>
              </div>
              <span v-if="t.isPremium" style="font-size:.7em;background:var(--bew-warning-color-20);color:var(--bew-warning-color);padding:1px 8px;border-radius:999px;font-weight:600">Premium</span>
            </div>
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.team-card { transition: box-shadow .2s, transform .2s; }
.team-card:hover { box-shadow: var(--bew-shadow-2)!important; transform: translateY(-2px); }
.discuss-row:hover { background: var(--bew-fill-2); }
</style>
