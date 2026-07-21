<script setup lang="ts">
import { renderIcon } from '~/utils/icons'

interface RankUser {
  uid: number
  avatar: string
  name: string
  slogan: string
  color: string
  badge: string | null
  rating: number
  scores: { social: number; basic: number; contest: number; practice: number; prize: number }
}

const users = ref<RankUser[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const errorMsg = ref('')
const currentPage = ref(1)
const totalCount = ref(0)
const pageSize = 50
const sentinelRef = ref<HTMLDivElement>()
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))

function ratingColor(r: number): string {
  if (r >= 400) return '#FF0000'; if (r >= 350) return '#FF8C00'
  if (r >= 300) return '#AA00AA'; if (r >= 250) return '#0000FF'
  if (r >= 200) return '#03A89E'; return '#808080'
}
function ratingLabel(r: number): string {
  if (r >= 400) return 'NOI 巨佬'; if (r >= 350) return '省选'
  if (r >= 300) return '提高'; if (r >= 250) return '普及+/提高'
  if (r >= 200) return '普及'; return '入门'
}

async function fetchRanking(append = false) {
  if (append) loadingMore.value = true; else loading.value = true
  errorMsg.value = ''
  try {
    const data = await browser.runtime.sendMessage({ contentScriptQuery: 'RANKING.getList', page: currentPage.value })
    if (data?.error) { errorMsg.value = data.error }
    else if (data?.__needLogin) { errorMsg.value = '需要登录洛谷才能查看' }
    else if (data?.data?.ranking) {
      const r = data.data.ranking
      const items = (r.result || []).map((u: any) => ({
        uid: u.user.uid, avatar: u.user.avatar, name: u.user.name,
        slogan: u.user.slogan, color: u.user.color, badge: u.user.badge,
        rating: u.rating, scores: u.scores || {},
      }))
      users.value = append ? [...users.value, ...items] : items
      totalCount.value = r.count || 0
    } else { errorMsg.value = '数据格式不匹配' }
  } catch (e: any) { errorMsg.value = e.message }
  finally { loading.value = false; loadingMore.value = false }
}

function loadMore() {
  if (loadingMore.value || currentPage.value >= totalPages.value) return
  currentPage.value++
  fetchRanking(true)
}

function openUser(uid: number) { window.open(`https://www.luogu.com.cn/user/${uid}`, '_blank') }

onMounted(() => fetchRanking())

// Waterfall sentinel
let obs: IntersectionObserver | null = null
onMounted(() => {
  obs = new IntersectionObserver((e) => {
    if (e[0]?.isIntersecting && !loading.value && !loadingMore.value) loadMore()
  }, { rootMargin: '1200px' })
  nextTick(() => { if (obs && sentinelRef.value) obs.observe(sentinelRef.value) })
})
watch(sentinelRef, (el) => { obs?.disconnect(); if (el) obs?.observe(el as Element) })
onUnmounted(() => obs?.disconnect())
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
      <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:700" mb-2 flex="~ items-center gap-2">
        <span style="display:contents;color:var(--bew-theme-color)" v-html="renderIcon('mingcute:chart-bar-line', 24)" />
        排行榜
      </h1>
      <p text="$bew-text-2">洛谷咕值排名 — 共 {{ totalCount }} 名用户</p>
    </div>

    <Loading v-if="loading" />
    <div v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 border="1 $bew-border-color" text="center $bew-text-2">
      <span v-html="renderIcon('mingcute:warning-line',32)" style="display:contents"/><p mt-2>{{ errorMsg }}</p>
    </div>

    <Transition name="content-reveal">
      <div v-if="!loading && users.length>0" bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]" border="1 $bew-border-color" style="backdrop-filter:var(--bew-filter-glass-1)">
        <div flex="~" items="center" p="x-6 y-3" bg="$bew-fill-1" border="b-1 $bew-border-color" text="sm $bew-text-2" fw-bold style="position:sticky;top:calc(var(--bew-top-bar-height) + 10px);z-index:9;border-top-left-radius:var(--bew-radius);border-top-right-radius:var(--bew-radius)">
          <div w="60px" text-center>#</div><div flex="1">用户</div><div w="80px" text-center>咕值</div><div w="120px" text-center class="hidden md:block">等级</div>
        </div>
        <div overflow="hidden" style="border-bottom-left-radius:var(--bew-radius);border-bottom-right-radius:var(--bew-radius)">
        <div v-for="(u, idx) in users" :key="u.uid" class="stagger-row hover:bg-$bew-fill-2" :style="{ '--row-index': idx }" flex="~" items="center" p="x-6 y-3.5" cursor="pointer" duration-200 border="b-1 $bew-border-color" @click="openUser(u.uid)">
          <div w="60px" flex="~" items="center" justify="center">
            <span v-if="idx < 3" v-html="renderIcon('mingcute:medal-fill',22)" :style="{color:['#B8860B','#808080','#8B4513'][idx]}" style="display:contents" />
            <span v-else text="sm $bew-text-2" fw-bold>{{ idx + 1 + (currentPage-1)*pageSize }}</span>
          </div>
          <div flex="~ 1" items="center" gap-3>
            <div w="36px" h="36px" rounded-full bg="$bew-fill-2" flex="~" items="center" justify="center" overflow-hidden shrink-0 pos="relative">
              <img :src="u.avatar" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0" @error="(e) => {(e.target as HTMLImageElement).style.display='none'}">
              <span v-html="renderIcon('mingcute:user-4-line',18)" style="pointer-events:none" />
            </div>
            <div flex="~ col">
              <span text="sm" fw-bold :style="{ color: ratingColor(u.rating) }">{{ u.name }}</span>
              <span v-if="u.slogan" text="xs $bew-text-3" overflow-hidden style="text-overflow:ellipsis;white-space:nowrap;max-width:clamp(80px, 30vw, 200px)">{{ u.slogan }}</span>
            </div>
          </div>
          <div w="80px" text="sm" fw-bold text-center :style="{ color: ratingColor(u.rating) }">{{ u.rating }}</div>
          <div w="120px" flex="~" justify="center" class="hidden md:flex">
            <span text="xs" p="x-2 y-0.5" rounded="$bew-radius-half" :style="{ backgroundColor: `${ratingColor(u.rating)}20`, color: ratingColor(u.rating) }">{{ ratingLabel(u.rating) }}</span>
          </div>
        </div>
        </div>
      </div>
    </Transition>

    <Loading v-if="loadingMore" />
    <div v-if="!loading && users.length>0 && currentPage<totalPages" ref="sentinelRef" style="height:60px;display:flex;align-items:center;justify-content:center" text="sm $bew-text-3">向下滚动加载更多...</div>
    <div v-if="!loading && users.length>0 && currentPage>=totalPages" text="sm $bew-text-3" text-center pb-8>已加载全部 {{ totalCount }} 名用户</div>
  </div>
</template>
