<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'
import { friendlyError } from '~/utils/luogu-api'
import { parseMarkdownContent } from '~/utils/markdown'
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'

const { currentUrl, navigateTo } = useGulyApp()
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

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
const subPath = computed(() => { const m = currentUrl.value.match(/\/team\/\d+\/(\w+)/i); return m ? m[1] : '' })
const detail = ref<any>(null)
const detailLoading = ref(false)

// Sub-page data
const subPageItems = ref<any[]>([])
const subPageLoading = ref(false)
const subPageError = ref('')
const subPageTotal = ref(0)
const subPageCurrent = ref(1)
const subPageSize = 20

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
  } catch (e) { console.warn('[GuluGulu]', e) }
  detailLoading.value = false
  // usages.training is a combined (trainings+homework) quota, not a per-type
  // count — fetch each sub-page's real count so 题单/作业 show correct numbers.
  Promise.all([fetchTeamSubCount(id, 'training'), fetchTeamSubCount(id, 'homework')]).then(([tr, hw]) => {
    if (detail.value) detail.value = { ...detail.value, counts: { training: tr, homework: hw } }
  })
}

// Fetch a team sub-page's real item count. trainings & homework are both served
// under data.trainings on their respective sub-pages (pre-filtered server-side),
// so the count must be read per sub-page — usages.training is only a combined quota.
async function fetchTeamSubCount(id: number, path: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.luogu.com.cn/team/${id}/${path}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const t = ctx?.data?.trainings
      if (t && typeof t === 'object') return t.count ?? t.result?.length ?? 0
    }
  } catch (e) { console.warn('[GuluGulu]', e) }
  return null
}

// Extract items from lentille-context, trying multiple data paths
function extractSubItems(cd: any, path: string): any[] {
  // Try known field names for each sub-page type
  const pathMaps: Record<string, string[]> = {
    contest: ['contests', 'teamContests'],
    problem: ['problems', 'teamProblems'],
    training: ['trainings', 'teamTrainings'],
    homework: ['trainings', 'homeworks', 'teamHomeworks'],
    file: ['files', 'teamFiles'],
  }
  const keys = pathMaps[path] || [path]
  for (const k of keys) {
    // Try cd.{k}.result first, then cd.{k} as array
    if (cd[k]?.result && Array.isArray(cd[k].result))
      return cd[k].result
    if (Array.isArray(cd[k]))
      return cd[k]
  }
  // Fallback: search through cd for any key containing the path name
  for (const k of Object.keys(cd)) {
    if (k.toLowerCase().includes(path) && Array.isArray(cd[k]))
      return cd[k]
    if (k.toLowerCase().includes(path) && cd[k]?.result && Array.isArray(cd[k].result))
      return cd[k].result
  }
  return []
}

async function fetchTeamSubPage(id: number, path: string, page = 1) {
  subPageLoading.value = true
  subPageError.value = ''
  try {
    const url = page > 1
      ? `https://www.luogu.com.cn/team/${id}/${path}?page=${page}`
      : `https://www.luogu.com.cn/team/${id}/${path}`
    const res = await fetch(url, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const cd = ctx?.data || ctx?.currentData || {}
      const items = extractSubItems(cd, path)
      subPageItems.value = items
      subPageCurrent.value = page
      // Try to get total count
      const totalKey = Object.keys(cd).find(k => k.toLowerCase().includes(path))
      if (totalKey && cd[totalKey]?.count !== undefined)
        subPageTotal.value = cd[totalKey].count
      else if (items.length < subPageSize)
        subPageTotal.value = items.length
      else
        subPageTotal.value = page * subPageSize + 1 // assume more pages
    } else {
      subPageError.value = '无法加载数据，请先登录'
    }
  } catch (e: any) { subPageError.value = friendlyError(e) }
  subPageLoading.value = false
}

function nextSubPage() {
  if (subPageCurrent.value * subPageSize < subPageTotal.value)
    fetchTeamSubPage(teamId.value!, subPath.value, subPageCurrent.value + 1)
}
function prevSubPage() {
  if (subPageCurrent.value > 1)
    fetchTeamSubPage(teamId.value!, subPath.value, subPageCurrent.value - 1)
}

function openTeam(id: number) { navigateTo(AppPage.Team, `https://www.luogu.com.cn/team/${id}`) }
function backToTeams() { navigateTo(AppPage.Team, 'https://www.luogu.com.cn/user/mine/team') }
function backToTeamHome() { navigateTo(AppPage.Team, `https://www.luogu.com.cn/team/${teamId.value}`) }
function openUser(uid: number) { window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank') }
function openPost(id: number) { window.open(`https://www.luogu.com.cn/discuss/${id}`, '_blank') }
function openTeamPage(section: string) { navigateTo(AppPage.Team, `https://www.luogu.com.cn/team/${teamId.value}/${section}`) }
function openProblemInExt(pid: string) { navigateTo(AppPage.ProblemDetail, `https://www.luogu.com.cn/problem/${pid}`) }
function openTrainingInExt(id: number) { navigateTo(AppPage.Training, `https://www.luogu.com.cn/training/${id}`) }
function openContestInExt(id: number) { navigateTo(AppPage.ContestDetail, `https://www.luogu.com.cn/contest/${id}`) }
function formatDate(ts: number): string { return ts ? new Date(ts * 1000).toLocaleDateString('zh-CN') : '' }
function formatDateTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}
function formatFileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

const subPathLabels: Record<string, string> = {
  contest: '团队比赛', problem: '团队题目', training: '团队题单',
  homework: '团队作业', file: '团队文件',
}

const lastTeamId = ref<number | null>(null)

function loadContent() {
  if (teamId.value) {
    loading.value = false
    // Only re-fetch team detail if teamId changed
    if (lastTeamId.value !== teamId.value) {
      detail.value = null
      fetchTeamDetail(teamId.value)
      lastTeamId.value = teamId.value
    }
    if (subPath.value)
      fetchTeamSubPage(teamId.value, subPath.value)
  } else {
    lastTeamId.value = null
    detail.value = null
    fetchTeamList()
  }
}
onMounted(loadContent)
watch(() => currentUrl.value, () => loadContent())
</script>

<template>
  <div :class="{ 'page-container': !props.embedded }" w-full h-full :p="props.embedded ? '' : 'x-4 md:x-8 lg:x-16'" pos="relative">
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

      <!-- ============================================================ -->
      <!-- Sub-Page View -->
      <!-- ============================================================ -->
      <div v-if="subPath">
        <button @click="backToTeamHome" style="background:none;border:none;cursor:pointer;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)" mb-4>← 返回团队主页</button>
        <div bg="$bew-content" rounded="$bew-radius" p-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
          <h2 style="font-size:1.1rem;font-weight:700;color:var(--bew-text-1)" mb-4>
            {{ subPathLabels[subPath] || subPath }}
          </h2>

          <Loading v-if="subPageLoading" />
          <div v-if="subPageError" text="center $bew-text-2" p-4>{{ subPageError }}</div>

          <template v-if="!subPageLoading && !subPageError">
            <div v-if="subPageItems.length === 0" text="center $bew-text-3" p-4>暂无内容</div>

            <!-- Contest list -->
            <template v-if="subPath === 'contest'">
              <div v-for="item in subPageItems" :key="item.id" flex="~ items-center justify-between" p-3 rounded="$bew-radius" bg="$bew-fill-1" mb-2 cursor="pointer" class="item-row" @click="openContestInExt(item.id)">
                <div flex="1" min-w-0>
                  <div style="font-weight:600;color:var(--bew-text-1);font-size:var(--bew-base-font-size)">{{ item.name || item.title }}</div>
                  <div v-if="item.startTime || item.endTime" style="font-size:.75em;color:var(--bew-text-3)" mt-1>
                    {{ formatDateTime(item.startTime) }} — {{ formatDateTime(item.endTime) }}
                    <span v-if="item.endTime && item.endTime * 1000 < Date.now()" style="color:var(--bew-text-3);margin-left:4px">(已结束)</span>
                    <span v-else-if="item.startTime && item.startTime * 1000 > Date.now()" style="color:var(--bew-info-color);margin-left:4px">(未开始)</span>
                    <span v-else style="color:var(--bew-success-color);margin-left:4px">(进行中)</span>
                  </div>
                </div>
                <span style="font-size:.8em;color:var(--bew-text-3);flex-shrink:0;margin-left:8px">{{ item.method === 1 ? 'OI' : item.method === 2 ? 'ICPC' : item.method === 3 ? '乐多' : item.method === 4 ? 'IOI' : '' }}</span>
              </div>
            </template>

            <!-- Problem list -->
            <template v-else-if="subPath === 'problem'">
              <div v-for="item in subPageItems" :key="item.pid" flex="~ items-center justify-between" p-3 rounded="$bew-radius" bg="$bew-fill-1" mb-2 cursor="pointer" class="item-row" @click="openProblemInExt(item.pid)">
                <div flex="1" min-w-0>
                  <div flex="~ items-center gap-2">
                    <span style="font-weight:600;color:var(--bew-theme-color);font-size:var(--bew-base-font-size)">{{ item.pid }}</span>
                    <span style="font-weight:500;color:var(--bew-text-1);font-size:var(--bew-base-font-size)">{{ item.title || item.name }}</span>
                  </div>
                  <div v-if="item.totalSubmit > 0" style="font-size:.75em;color:var(--bew-text-3)" mt-1>
                    通过 {{ item.totalAccepted || 0 }} / {{ item.totalSubmit }}
                    <span style="color:var(--bew-success-color)"> ({{ Math.round((item.totalAccepted||0)/item.totalSubmit*100) }}%)</span>
                  </div>
                </div>
                <div flex="~ items-center gap-2" style="flex-shrink:0;margin-left:8px">
                  <span v-if="item.difficulty" px-2 py-0.5 rounded-full style="font-size:.7em;color:var(--bew-text-2);background:var(--bew-fill-2)">{{ {1:'入门',2:'普及-',3:'普及',4:'普及+',5:'提高-',6:'提高',7:'提高+',8:'省选'}[item.difficulty] || item.difficulty }}</span>
                  <span v-if="item.status !== undefined" style="font-size:.75em;color:var(--bew-text-3)">{{ item.status === 12 ? '已AC' : item.score ? item.score+'分' : '' }}</span>
                </div>
              </div>
            </template>

            <!-- Training list -->
            <template v-else-if="subPath === 'training'">
              <div v-for="item in subPageItems" :key="item.id" flex="~ items-center justify-between" p-3 rounded="$bew-radius" bg="$bew-fill-1" mb-2 cursor="pointer" class="item-row" @click="openTrainingInExt(item.id)">
                <div flex="1" min-w-0>
                  <div style="font-weight:600;color:var(--bew-text-1);font-size:var(--bew-base-font-size)">{{ item.title || item.name }}</div>
                  <div v-if="item.description" style="font-size:.75em;color:var(--bew-text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" mt-1>{{ item.description.replace(/<[^>]+>/g, '').slice(0, 80) }}</div>
                  <div v-if="item.problemCount > 0 || item.passedCount > 0" style="font-size:.75em;color:var(--bew-text-3)" mt-1>
                    <span v-if="item.problemCount">{{ item.problemCount }} 题</span>
                    <span v-if="item.problemCount && (item.passedCount || item.doneCount)" mx-1>·</span>
                    <span v-if="item.passedCount || item.doneCount" style="color:var(--bew-success-color)">完成 {{ item.passedCount || item.doneCount }}</span>
                  </div>
                </div>
                <span v-if="item.difficulty" style="font-size:.75em;color:var(--bew-text-3);flex-shrink:0;margin-left:8px">{{ {1:'入门',2:'普及-',3:'普及',4:'普及+',5:'提高-',6:'提高',7:'提高+',8:'省选'}[item.difficulty] || '' }}</span>
              </div>
            </template>

            <!-- Homework list -->
            <template v-else-if="subPath === 'homework'">
              <div v-for="item in subPageItems" :key="item.id" flex="~ items-center justify-between" p-3 rounded="$bew-radius" bg="$bew-fill-1" mb-2 cursor="pointer" class="item-row" @click="openTrainingInExt(item.id)">
                <div flex="1" min-w-0>
                  <div style="font-weight:600;color:var(--bew-text-1);font-size:var(--bew-base-font-size)">{{ item.name || item.title }}</div>
                  <div style="font-size:.75em;color:var(--bew-text-3)" mt-1 flex="~ items-center gap-2" flex-wrap>
                    <span>{{ item.problemCount || 0 }} 题</span>
                    <span v-if="item.markCount > 0" style="color:var(--bew-success-color)">完成 {{ item.markCount }}</span>
                    <span v-if="item.deadline" :style="{ color: item.deadline * 1000 < Date.now() ? 'var(--bew-error-color)' : 'var(--bew-text-3)' }">
                      | 截止 {{ formatDateTime(item.deadline) }}
                      <span v-if="item.deadline * 1000 > Date.now()" style="color:var(--bew-info-color)">
                        ({{ Math.ceil((item.deadline * 1000 - Date.now()) / 86400000) }}天)
                      </span>
                    </span>
                    <span v-if="item.createTime">| 发布于 {{ formatDateTime(item.createTime) }}</span>
                  </div>
                </div>
              </div>
            </template>

            <!-- File list -->
            <template v-else-if="subPath === 'file'">
              <div v-for="item in subPageItems" :key="item.id || item.filename" flex="~ items-center justify-between" p-3 rounded="$bew-radius" bg="$bew-fill-1" mb-2>
                <div flex="~ items-center gap-2" style="flex:1" min-w-0>
                  <span v-html="renderIcon('mingcute:file-line', 18)" :style="{color:'var(--bew-text-3)',display:'contents'}" />
                  <span style="font-weight:500;color:var(--bew-text-1);font-size:var(--bew-base-font-size)">{{ item.filename || item.name }}</span>
                  <span v-if="item.user?.name" style="font-size:.75em;color:var(--bew-text-3)">by {{ item.user.name }}</span>
                </div>
                <div flex="~ items-center gap-3" style="flex-shrink:0;margin-left:8px">
                  <span v-if="item.size" style="font-size:.8em;color:var(--bew-text-3)">{{ formatFileSize(item.size) }}</span>
                  <span v-if="item.uploadTime" style="font-size:.75em;color:var(--bew-text-3)">{{ formatDateTime(item.uploadTime) }}</span>
                </div>
              </div>
            </template>

            <!-- Generic fallback -->
            <template v-else>
              <div v-for="(item, idx) in subPageItems" :key="idx" p-3 rounded="$bew-radius" bg="$bew-fill-1" mb-2>
                <div style="font-weight:600;color:var(--bew-text-1);font-size:var(--bew-base-font-size)">{{ item.name || item.title || item.id }}</div>
              </div>
            </template>

            <!-- Pagination -->
            <div v-if="subPageTotal > subPageSize" mt-4 flex="~ items-center justify-center gap-4">
              <button @click="prevSubPage" :style="{background:'none',border:'none',cursor:subPageCurrent <= 1 ? 'default':'pointer',color:'var(--bew-theme-color)',fontSize:'var(--bew-base-font-size)',opacity:subPageCurrent <= 1 ? 0.4 : 1}" :disabled="subPageCurrent <= 1">← 上一页</button>
              <span style="font-size:var(--bew-base-font-size);color:var(--bew-text-2)">{{ subPageCurrent }} / {{ Math.ceil(subPageTotal / subPageSize) }}</span>
              <button @click="nextSubPage" :style="{background:'none',border:'none',cursor:subPageCurrent * subPageSize >= subPageTotal ? 'default':'pointer',color:'var(--bew-theme-color)',fontSize:'var(--bew-base-font-size)',opacity:subPageCurrent * subPageSize >= subPageTotal ? 0.4 : 1}" :disabled="subPageCurrent * subPageSize >= subPageTotal">下一页 →</button>
            </div>
          </template>
        </div>
      </div>

      <!-- Team home (no subPath) -->
      <template v-if="!subPath">
        <Loading v-if="detailLoading" />

        <div v-if="!detailLoading && detail">
          <!-- Notice -->
          <div v-if="detail.notice" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
            <h2 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)" mb-2>团队公告</h2>
            <div class="markdown-body" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);line-height:1.6" v-html="parseMarkdownContent(detail.notice)" />
          </div>
          <!-- Usage dashboard -->
          <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
            <h2 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)" mb-3>团队内容</h2>
            <div grid="~ cols-2 md:cols-3 xl:cols-5" gap-3>
              <div v-for="item in [
                {k:'problem',l:'题目',icon:'mingcute:code-line'},
                {k:'training',l:'题单',icon:'mingcute:book-4-line'},
                {k:'homework',l:'作业',icon:'mingcute:file-edit-line'},
                {k:'contest',l:'比赛',icon:'mingcute:trophy-line'},
                {k:'file',l:'文件',icon:'mingcute:folder-line'},
              ]" :key="item.k" bg="$bew-fill-1" rounded="$bew-radius" p-4 cursor="pointer" class="usage-card"
                @click="openTeamPage(item.k)">
                <div flex="~ items-center gap-2" mb-1>
                  <span v-html="renderIcon(item.icon,18)" :style="{color:'var(--bew-theme-color)',display:'contents'}" />
                  <span style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:600">{{ item.l }}</span>
                </div>
                <div style="font-size:.85em;color:var(--bew-text-3)">
                  <span v-if="item.k === 'file' && detail.usages.file?.[0]">{{ formatFileSize(detail.usages.file[0]) }}</span>
                  <span v-else-if="item.k === 'training' && detail.counts?.training != null">{{ detail.counts.training + ' 个' }}</span>
                  <span v-else-if="item.k === 'homework' && detail.counts?.homework != null">{{ detail.counts.homework + ' 个' }}</span>
                  <span v-else-if="detail.usages[item.k]?.[0]">{{ detail.usages[item.k][0] + ' 个' }}</span>
                  <span v-else>—</span>
                </div>
              </div>
            </div>
          </div>
          <!-- Member groups -->
          <div v-if="detail.groups?.length > 0" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
            <h2 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)" mb-3>成员组</h2>
            <div v-for="g in detail.groups" :key="g.id" flex="~ items-center justify-between" p-3 rounded="$bew-radius" bg="$bew-fill-1" mb-2>
              <span style="font-weight:600;color:var(--bew-text-1);font-size:var(--bew-base-font-size)">{{ g.name }}</span>
              <span v-if="g.permission" style="font-size:.8em;color:var(--bew-text-3)">
                {{ g.permission === 1 ? '管理员' : g.permission === 2 ? '普通成员' : '' }}
              </span>
            </div>
          </div>
          <!-- Discussions -->
          <div v-if="detail.latestDiscussions?.length > 0" bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
            <h2 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)" mb-3>最新讨论</h2>
            <div v-for="d in detail.latestDiscussions" :key="d.id" flex="~ items-center gap-3" p-2 rounded="8px" cursor="pointer" class="discuss-row" @click="openPost(d.id)">
              <img :src="d.author.avatar" style="width:24px;height:24px;border-radius:50%;flex-shrink:0" @error="(e:any) => e.target.style.display='none'" />
              <div flex="1" min-w-0>
                <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ d.title }}</div>
                <div style="font-size:.75em;color:var(--bew-text-3)">{{ d.author.name }} · {{ timeAgo(d.time) }} · {{ d.replyCount }} 回复</div>
              </div>
            </div>
          </div>
        </div>
      </template>
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
.item-row { transition: background .15s; }
.item-row:hover { background: var(--bew-fill-2)!important; }
</style>
