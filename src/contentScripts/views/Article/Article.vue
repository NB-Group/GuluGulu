<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'

interface Article {
  lid: string; title: string; category: number; time: number
  author: { uid: number; name: string; avatar: string; color: string }
}

const articles = ref<Article[]>([])
const loading = ref(true)
const errorMsg = ref('')

onMounted(async () => {
  try {
    const res = await fetch('https://www.luogu.com.cn/article', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      articles.value = (ctx?.data?.articles?.result || ctx?.data?.articles || [])
    } else { errorMsg.value = '请先登录洛谷' }
  } catch (e: any) { errorMsg.value = e.message }
  loading.value = false
})

const catLabels: Record<number, string> = { 1: '算法', 2: '游记', 3: '题解', 4: '杂谈', 5: '科技', 6: '生活' }
function openArticle(lid: string) { window.open('https://www.luogu.com.cn/article/' + lid, '_blank') }
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16">
    <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color">
      <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:700">专栏</h1>
    </div>
    <Loading v-if="loading" />
    <div v-if="!loading && errorMsg" bg="$bew-content" rounded="$bew-radius" p-8 text="center $bew-text-2" border="1 $bew-border-color">
      <span v-html="renderIcon('mingcute:warning-line',32)" style="display:contents"/><p mt-2>{{ errorMsg }}</p>
    </div>
    <Transition name="content-reveal">
      <div v-if="!loading && articles.length > 0" bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" overflow="hidden">
        <div v-for="(a, idx) in articles" :key="a.lid" class="stagger-row hover:bg-$bew-fill-2" :style="{'--row-index':idx}" flex="~ items-center" p="x-4 md:x-6 y-3.5" border="b-1 $bew-border-color" cursor="pointer" duration-200 @click="openArticle(a.lid)">
          <div flex-1 min-w-0>
            <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ a.title }}</div>
            <div flex="~ gap-2" mt-1 style="font-size:.8em;color:var(--bew-text-3)">
              <span :style="{color:a.author?.color?`var(--bew-${a.author.color})`:'var(--bew-text-2)'}">{{ a.author?.name }}</span>
              <span>{{ timeAgo(a.time) }}</span>
              <span>{{ catLabels[a.category] || '其他' }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
