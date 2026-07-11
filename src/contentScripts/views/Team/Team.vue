<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'
import { friendlyError } from '~/utils/luogu-api'
import { parseMarkdownContent } from '~/utils/markdown'
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'

const { currentUrl, navigateTo } = useGulyApp()

// ============================================================
// List view
// ============================================================
const teams = ref<any[]>([])
const loading = ref(true)
const errorMsg = ref('')

async function fetchTeamList() {
  loading.value = true; errorMsg.value = ''
  try {
    const res = await fetch('https://www.luogu.com.cn/user/mine/team', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const raw = ctx?.data?.teams || []
      teams.value = (Array.isArray(raw) ? raw : (raw.result || [])).map((t: any) => ({
        id: t.team?.id || t.id,
        name: t.team?.name || t.name || '',
        isPremium: t.team?.isPremium || false,
        type: t.type || 0,
      }))
    } else { errorMsg.value = '请先登录洛谷' }
  } catch (e: any) { errorMsg.value = friendlyError(e) }
  loading.value = false
}

function typeLabel(t: number): string {
  return t === 2 ? '教学' : t === 1 ? '比赛' : '普通'
}

// ============================================================
// Detail view
// ============================================================
const teamId = computed(() => { const m = currentUrl.value.match(/\/team\/(\d+)/i); return m ? Number(m[1]) : null })
const teamSection = computed(() => { const m = currentUrl.value.match(/\/team\/\d+\/(\w+)/i); return m ? m[1] : null })
const detail = ref<any>(null)
const detailLoading = ref(false)
const sectionData = ref<any[]>([])
const sectionLoading = ref(false)
const sectionError = ref('')

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
        detail.value = {
          team: cd.team,
          currentMember: cd.currentMember || null,
          groups: cd.groups || [],
          latestDiscussions: cd.latestDiscussions || [],
          notice: cd.notice || '',
          usages: cd.usages || {},
        }
      }
    }
  } catch {}
  detailLoading.value = false
}

// URL section name → lentille-context data key mapping
const SECTION_KEY_MAP: Record<string, string> = {
  homework: 'trainings', // homework page uses 'trainings' key in API
  problem: 'problems',
  contest: 'contests',
  member: 'members',
  file: 'files',
  training: 'trainings',
}

async function fetchTeamSection(id: number, section: string) {
  sectionLoading.value = true; sectionError.value = ''
  try {
    const res = await fetch(`https://www.luogu.com.cn/team/${id}/${section}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const cd = ctx?.data || ctx?.currentData || {}
      const dataKey = SECTION_KEY_MAP[section] || `${section}s`
      const raw = cd[dataKey] || []
      sectionData.value = Array.isArray(raw) ? raw : (raw?.result || [])
    } else {
      sectionError.value = '无法解析数据'
    }
  } catch (e: any) {
    sectionError.value = friendlyError(e)
  }
  sectionLoading.value = false
}

function openTeam(id: number) { navigateTo(AppPage.Team, `https://www.luogu.com.cn/team/${id}`) }
function backToTeams() { navigateTo(AppPage.Team, 'https://www.luogu.com.cn/user/mine/team') }
function backToOverview() { navigateTo(AppPage.Team, `https://www.luogu.com.cn/team/${teamId.value}`) }
function openUser(uid: number) { window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank') }
function openPost(id: number) { window.open(`https://www.luogu.com.cn/discuss/${id}`, '_blank') }
function openTeamPage(section: string) { navigateTo(AppPage.Team, `https://www.luogu.com.cn/team/${teamId.value}/${section}`) }
function openTrainingItem(id: number) { navigateTo(AppPage.Training, `https://www.luogu.com.cn/training/${id}`) }
function openContestItem(id: number) { navigateTo(AppPage.ContestDetail, `https://www.luogu.com.cn/contest/${id}`) }

function sectionTitle(s: string): string {
  const titles: Record<string, string> = { problem: '题目', homework: '作业', training: '题单', contest: '比赛', member: '成员', file: '文件' }
  return titles[s] || s
}

function memberTypeLabel(t: number): string { return t === 3 ? '团长' : t === 2 ? '管理员' : t === 1 ? '队员' : '访客' }

function formatDate(ts: number): string { return ts ? new Date(ts * 1000).toLocaleDateString('zh-CN') : '' }
function formatDateTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function formatFileSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

function loadContent() {
  if (teamId.value) {
    loading.value = false // detail paths don't go through fetchTeamList
    detail.value = null; sectionData.value = []
    fetchTeamDetail(teamId.value)
    if (teamSection.value) fetchTeamSection(teamId.value, teamSection.value)
  } else {
    detail.value = null; sectionData.value = []
    fetchTeamList()
  }
}
onMounted(loadContent)
watch(teamId, () => loadContent())
watch(teamSection, () => { if (teamId.value && teamSection.value) fetchTeamSection(teamId.value, teamSection.value) })
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
          <div w="56px" h="56px" rounded="12px" bg="$bew-theme-color-20" flex="~ items-center justify-center" style="font-size:1.5rem;color:var(--bew-theme-color);font-weight:700">{{ detail?.team?.name?.charAt(0) || '?' }}</div>
          <div flex="1">
            <h1 style="font-size:1.25rem;font-weight:700;color:var(--bew-text-1)">{{ detail?.team?.name }}</h1>
            <div flex="~ gap-2" mt-1 style="font-size:.85em;color:var(--bew-text-3)">
              <span>{{ typeLabel(detail?.team?.type || 0) }}团队</span>
              <span v-if="detail?.team?.isPremium" style="color:var(--bew-warning-color);font-weight:600">Premium</span>
              <span>{{ detail?.team?.memberCount || 0 }} 名成员</span>
              <span>创建于 {{ formatDate(detail?.team?.createTime || 0) }}</span>
            </div>
          </div>
        </div>
        <div v-if="detail?.team?.master" flex="~ items-center gap-2" mb-3>
          <span style="font-size:.85em;color:var(--bew-text-3)">团长:</span>
          <img :src="detail.team.master.avatar" style="width:22px;height:22px;border-radius:50%;cursor:pointer" @click="openUser(detail.team.master.uid)" @error="(e:any) => e.target.style.display='none'" />
          <span :style="{ color: `var(--bew-${detail.team.master.color})`, fontWeight: 600, fontSize: '.9em', cursor: 'pointer' }" @click="openUser(detail.team.master.uid)">{{ detail.team.master.name }}</span>
        </div>
        <div v-if="detail?.currentMember" px-3 py-1 rounded-full inline-block style="font-size:.8em" :style="{ background: 'var(--bew-success-color-20)', color: 'var(--bew-success-color)' }">已加入</div>
      </div>

      <Loading v-if="detailLoading" />

      <div v-if="!detailLoading && detail">
        <!-- ============================================================ -->
        <!-- Section content (sub-pages: problem/homework/training/contest/member/file) -->
        <!-- ============================================================ -->
        <div v-if="teamSection" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <div flex="~ items-center gap-2" mb-4>
            <button @click="backToOverview" style="background:none;border:none;cursor:pointer;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)">← 团队详情</button>
            <span style="color:var(--bew-text-3)">/</span>
            <h2 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)">{{ sectionTitle(teamSection) }}</h2>
          </div>
          <Loading v-if="sectionLoading" />
          <div v-else-if="sectionError" text="center $bew-text-2" p-4>{{ sectionError }}</div>
          <div v-else-if="sectionData.length === 0" text="center $bew-text-3" p-4>暂无内容</div>

          <template v-else>
          <Transition name="content-reveal" mode="out-in" :duration="400">
          <!-- homework / training list -->
          <div v-if="teamSection === 'homework' || teamSection === 'training'" :key="'homework'">
            <div v-for="(item, idx) in sectionData" :key="item.id" bg="$bew-fill-1" rounded="$bew-radius" p-4 mb-3 class="stagger-row section-item" :style="{'--row-index':idx}" cursor="pointer" @click="openTrainingItem(item.id)">
            <div flex="~ items-center justify-between">
              <div>
                <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600">{{ item.name }}</div>
                <div style="font-size:.8em;color:var(--bew-text-3)" mt-1>
                  {{ item.problemCount || 0 }} 题
                  <span v-if="item.markCount !== undefined"> · {{ item.markCount }} 人完成</span>
                  <span v-if="item.deadline"> · 截止 {{ formatDateTime(item.deadline) }}</span>
                </div>
              </div>
              <span v-if="item.deadline" style="font-size:.75em;color:var(--bew-text-3)">{{ item.deadline > Date.now()/1000 ? '进行中' : '已截止' }}</span>
            </div>
            </div>
          </div>

          <!-- contest list -->
          <div v-else-if="teamSection === 'contest'" :key="'contest'">
            <div v-for="(item, idx) in sectionData" :key="item.id" bg="$bew-fill-1" rounded="$bew-radius" p-4 mb-3 class="stagger-row section-item" :style="{'--row-index':idx}" cursor="pointer" @click="openContestItem(item.id)">
            <div flex="~ items-center justify-between">
              <div>
                <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600">{{ item.name }}</div>
                <div style="font-size:.8em;color:var(--bew-text-3)" mt-1>
                  {{ item.problemCount || 0 }} 题 · {{ formatDateTime(item.startTime) }} – {{ formatDateTime(item.endTime) }}
                </div>
              </div>
              <span style="font-size:.75em;color:var(--bew-text-3)">
                {{ Date.now()/1000 < item.startTime ? '即将开始' : Date.now()/1000 < item.endTime ? '进行中' : '已结束' }}
              </span>
            </div>
          </div>
          </div>

          <!-- member list -->
          <div v-else-if="teamSection === 'member'" :key="'member'">
            <div v-for="(item, idx) in sectionData" :key="item.user?.uid" flex="~ items-center gap-3" p-3 rounded="$bew-radius" bg="$bew-fill-1" mb-2 class="stagger-row section-item" :style="{'--row-index':idx}" cursor="pointer" @click="openUser(item.user?.uid)">
            <img :src="item.user?.avatar" style="width:36px;height:36px;border-radius:50%;flex-shrink:0" @error="(e:any) => e.target.style.display='none'" />
            <div flex="1">
              <div :style="{fontSize:'var(--bew-base-font-size)',fontWeight:600,color:`var(--bew-${item.user?.color || 'text-1'})`}">
                {{ item.user?.name }}
                <span v-if="item.realName" style="font-size:.8em;color:var(--bew-text-3);font-weight:400">({{ item.realName }})</span>
              </div>
              <div style="font-size:.75em;color:var(--bew-text-3)">{{ memberTypeLabel(item.type) }}</div>
            </div>
          </div>
          </div>

          <!-- file list -->
          <div v-else-if="teamSection === 'file'" :key="'file'">
            <div v-for="(item, idx) in sectionData" :key="item.id" bg="$bew-fill-1" rounded="$bew-radius" p-4 mb-3 class="stagger-row section-item" :style="{'--row-index':idx}" cursor="pointer" @click="window.open(`https://www.luogu.com.cn/team/${teamId}/file/${item.id}`, '_blank')">
            <div flex="~ items-center justify-between">
              <div flex="1" min-w-0>
                <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ item.filename }}</div>
                <div style="font-size:.8em;color:var(--bew-text-3)" mt-1>
                  {{ formatFileSize(item.size) }} · {{ item.user?.name }} · {{ formatDateTime(item.uploadTime) }}
                </div>
              </div>
            </div>
          </div>
          </div>
          </Transition>
          </template>
        </div>

        <!-- ============================================================ -->
        <!-- Overview (no section selected) -->
        <!-- ============================================================ -->
        <template v-if="!teamSection">
        <Transition name="content-reveal" appear :duration="400">
        <div>
          <!-- Notice -->
          <div v-if="detail.notice" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
            <h2 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)" mb-2>团队公告</h2>
            <div class="markdown-body" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);line-height:1.6" v-html="parseMarkdownContent(detail.notice)" />
          </div>

          <!-- Usage dashboard -->
          <div v-if="detail.usages" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
            <h2 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)" mb-3>团队内容</h2>
            <div grid="~ cols-2 md:cols-3" gap-3>
              <div v-for="(item, idx) in [
                {k:'problem',l:'题目',icon:'mingcute:code-line',path:'problem'},
                {k:'homework',l:'作业',icon:'mingcute:document-line',path:'homework',usageKey:'training'},
                {k:'training',l:'题单',icon:'mingcute:book-4-line',path:'training'},
                {k:'contest',l:'比赛',icon:'mingcute:trophy-line',path:'contest'},
                {k:'member',l:'成员',icon:'mingcute:team-line',path:'member'},
                {k:'file',l:'文件',icon:'mingcute:folder-line',path:'file'},
              ]" :key="item.k" bg="$bew-fill-1" rounded="$bew-radius" p-4 cursor="pointer" class="stagger-card usage-card" :style="{'--card-index':idx}"
                @click="openTeamPage(item.path)">
                <div flex="~ items-center gap-2" mb-1>
                  <span v-html="renderIcon(item.icon,18)" :style="{color:'var(--bew-theme-color)',display:'contents'}" />
                  <span style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600">{{ item.l }}</span>
                </div>
                <div style="font-size:.85em;color:var(--bew-text-3)">
                  <span v-if="item.usageKey ? (detail.usages[item.usageKey]?.[0] !== undefined) : (detail.usages[item.k]?.[0] !== undefined)">
                    {{ item.k === 'file' ? formatFileSize(detail.usages[item.usageKey || item.k][0]) : (detail.usages[item.usageKey || item.k][0] + ' 个') }}
                  </span>
                  <span v-else>—</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Member groups -->
          <div v-if="detail.groups && detail.groups.length > 0" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
            <h2 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)" mb-3>成员组</h2>
            <div v-for="(g, idx) in detail.groups" :key="g.id" class="stagger-row" :style="{'--row-index':idx}" flex="~ items-center justify-between" p-3 rounded="$bew-radius" bg="$bew-fill-1" mb-2>
              <span style="font-weight:600;color:var(--bew-text-1);font-size:var(--bew-base-font-size)">{{ g.name }}</span>
            </div>
          </div>

          <!-- Discussions -->
          <div v-if="detail.latestDiscussions && detail.latestDiscussions.length > 0" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
            <h2 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)" mb-3>最新讨论</h2>
            <div v-for="(d, idx) in detail.latestDiscussions" :key="d.id" class="stagger-row discuss-row" :style="{'--row-index':idx}" flex="~ items-center gap-3" p-2 rounded="8px" cursor="pointer" @click="openPost(d.id)">
              <img :src="d.author.avatar" style="width:24px;height:24px;border-radius:50%;flex-shrink:0" @error="(e:any) => e.target.style.display='none'" />
              <div flex="1" min-w-0>
                <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ d.title }}</div>
                <div style="font-size:.75em;color:var(--bew-text-3)">{{ d.author.name }} · {{ timeAgo(d.time) }} · {{ d.replyCount }} 回复</div>
              </div>
            </div>
          </div>
        </div>
        </Transition>
        </template>
      </div>
    </template>

    <!-- ============================================================ -->
    <!-- List View -->
    <!-- ============================================================ -->
    <template v-if="!teamId && !loading">
      <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
        <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:700" mb-4>我的团队</h1>
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
                <div style="font-size:.8em;color:var(--bew-text-3)">{{ typeLabel(t.type) }}团队</div>
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
.usage-card { transition: box-shadow .2s, transform .2s; }
.usage-card:hover { box-shadow: var(--bew-shadow-2)!important; transform: translateY(-2px); }
.section-item { transition: box-shadow .2s, transform .2s; }
.section-item:hover { box-shadow: var(--bew-shadow-2)!important; transform: translateY(-2px); }
</style>
