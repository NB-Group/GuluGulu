<script setup lang="ts">
const props = defineProps<{
  query?: string
}>()

interface SearchResultItem {
  type: 'problem' | 'contest' | 'blog' | 'user'
  title: string
  subtitle: string
  id: string
  tags?: string[]
  extra?: string
}

const searchQuery = ref(props.query || '')
const loading = ref(false)
const hasSearched = ref(false)

const mockResults: SearchResultItem[] = [
  {
    type: 'problem',
    title: 'P1001 A+B Problem',
    subtitle: '入门 | 通过率 80%',
    id: 'P1001',
    tags: ['模拟', '字符串'],
    extra: '123456 次提交',
  },
  {
    type: 'problem',
    title: 'P1002 过河卒',
    subtitle: '普及- | 通过率 49%',
    id: 'P1002',
    tags: ['动态规划', 'DP'],
    extra: '87654 次提交',
  },
  {
    type: 'problem',
    title: 'P1003 铺设道路',
    subtitle: '入门 | 通过率 61%',
    id: 'P1003',
    tags: ['贪心'],
    extra: '56789 次提交',
  },
  {
    type: 'blog',
    title: '动态规划从入门到精通——斜率优化详解',
    subtitle: 'NaCly_Fish · 5 小时前',
    id: '2',
    tags: ['DP', '算法'],
    extra: '89 评论',
  },
  {
    type: 'contest',
    title: '洛谷 2024 七月月赛 Div.1',
    subtitle: '已结束 · OI · Rated',
    id: '1',
    tags: ['月赛', 'Div.1'],
    extra: 'Rank 5',
  },
  {
    type: 'user',
    title: 'NaCly_Fish',
    subtitle: 'Rating: 3241 · Rank #1',
    id: '1',
    tags: ['NOI 巨佬'],
    extra: '1847 通过',
  },
  {
    type: 'blog',
    title: '关于 CSP-J/S 2024 第二轮认证的若干说明',
    subtitle: '洛谷官方 · 2 小时前',
    id: '1',
    tags: ['CSP', '公告'],
    extra: '156 评论',
  },
  {
    type: 'problem',
    title: 'P2001 线段树模板',
    subtitle: '提高 | 通过率 35%',
    id: 'P2001',
    tags: ['线段树', '数据结构'],
    extra: '23456 次提交',
  },
]

const typeConfig: Record<string, { label: string, color: string, bg: string, icon: string }> = {
  problem: { label: '题目', color: '#1890ff', bg: '#1890ff20', icon: 'i-mingcute:code-line' },
  contest: { label: '比赛', color: '#52c41a', bg: '#52c41a20', icon: 'i-mingcute:trophy-line' },
  blog: { label: '讨论', color: '#722ed1', bg: '#722ed120', icon: 'i-mingcute:comment-line' },
  user: { label: '用户', color: '#faad14', bg: '#faad1420', icon: 'i-mingcute:user-4-line' },
}

const filteredResults = computed(() => {
  if (!searchQuery.value)
    return []
  const q = searchQuery.value.toLowerCase()
  return mockResults.filter(r => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q))
})

function handleSearch(keyword: string) {
  searchQuery.value = keyword
  loading.value = true
  hasSearched.value = true
  setTimeout(() => {
    loading.value = false
  }, 600)
}

function openResult(item: SearchResultItem) {
  const urls: Record<string, string> = {
    problem: `https://www.luogu.com.cn/problem/${item.id}`,
    contest: `https://www.luogu.com.cn/contest/${item.id}`,
    blog: `https://www.luogu.com.cn/discuss/${item.id}`,
    user: `https://www.luogu.com.cn/user/${item.id}`,
  }
  window.open(urls[item.type] || 'https://www.luogu.com.cn/', '_blank')
}

function openLuoguSearch() {
  window.open(`https://www.luogu.com.cn/problem/list?keyword=${encodeURIComponent(searchQuery.value)}`, '_blank')
}
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <!-- Search Header -->
    <div
      bg="$bew-content"
      rounded="$bew-radius"
      p-6
      mb-6
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 $bew-border-color"
      style="backdrop-filter: var(--bew-filter-glass-1)"
    >
      <h1 text="2xl $bew-text-1" fw-bold mb-4>
        搜索
      </h1>
      <div max-w="550px">
        <SearchBar @search="handleSearch" />
      </div>
    </div>

    <!-- Search query indicator -->
    <div v-if="hasSearched && searchQuery" text="sm $bew-text-2" mb-4 flex="~ items-center gap-2">
      <span>搜索: </span>
      <span fw-bold text="$bew-theme-color">"{{ searchQuery }}"</span>
      <span>找到 {{ filteredResults.length }} 个结果</span>
    </div>

    <!-- Loading -->
    <Loading v-if="loading" />

    <!-- Results List -->
    <Transition name="content-reveal">
      <div
        v-if="!loading && hasSearched && filteredResults.length > 0"
        bg="$bew-content"
        rounded="$bew-radius"
        shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
        border="1 $bew-border-color"
        style="backdrop-filter: var(--bew-filter-glass-1)"
        overflow="hidden"
      >
        <div
          v-for="(item, index) in filteredResults"
          :key="`${item.type}-${item.id}`"
          class="stagger-row hover:bg-$bew-fill-2"
          :style="{ '--row-index': index }"
          flex="~ items-center gap-3"
          p="x-6 y-3.5"
          cursor="pointer"
          duration-200
          border="b-1 $bew-border-color"
          :class="index === filteredResults.length - 1 ? 'border-b-0' : ''"
          @click="openResult(item)"
        >
          <!-- Type icon -->
          <div
            w="36px"
            h="36px"
            rounded-full
            shrink-0
            flex="~"
            items="center"
            justify="center"
            :style="{ backgroundColor: typeConfig[item.type].bg }"
          >
            <div :class="typeConfig[item.type].icon" :style="{ color: typeConfig[item.type].color }" />
          </div>

          <!-- Content -->
          <div flex="~ col 1" gap-0.5 min-w-0>
            <div flex="~ items-center gap-2">
              <span
                text="xs"
                p="x-1.5 y-0.5"
                rounded="$bew-radius-half"
                :style="{
                  backgroundColor: typeConfig[item.type].bg,
                  color: typeConfig[item.type].color,
                }"
                shrink-0
              >{{ typeConfig[item.type].label }}</span>
              <span text="sm $bew-text-1" fw-bold overflow-hidden text-ellipsis whitespace-nowrap>
                {{ item.title }}
              </span>
            </div>
            <span text="xs $bew-text-3" overflow-hidden text-ellipsis whitespace-nowrap>
              {{ item.subtitle }}
            </span>
          </div>

          <!-- Tags -->
          <div flex="~ gap-1" class="hidden md:flex" shrink-0>
            <span
              v-for="tag in (item.tags || []).slice(0, 2)"
              :key="tag"
              text="xs $bew-text-3"
              p="x-1.5 y-0.5"
              rounded="$bew-radius-half"
              bg="$bew-fill-1"
            >{{ tag }}</span>
          </div>

          <!-- Extra info -->
          <span text="xs $bew-text-2" shrink-0 class="hidden sm:block">
            {{ item.extra }}
          </span>

          <div i-mingcute:right-line text="sm $bew-text-3" shrink-0 />
        </div>
      </div>
    </Transition>

    <!-- Empty State -->
    <Empty v-if="!loading && hasSearched && filteredResults.length === 0" description="未找到相关结果">
      <Button type="primary" mt-4 @click="openLuoguSearch">
        前往洛谷搜索
      </Button>
    </Empty>

    <!-- Initial state (no search yet) -->
    <div v-if="!hasSearched" flex="~ col" items="center" justify="center" py-16>
      <div i-mingcute:search-line text="6xl $bew-text-3" mb-4 />
      <p text="lg $bew-text-2">
        输入关键词搜索题目、比赛、讨论或用户
      </p>
    </div>
  </div>
</template>
