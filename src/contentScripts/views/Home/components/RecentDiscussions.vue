<script setup lang="ts">
import { renderIcon } from '~/utils/icons'

defineProps<{
  gridLayout?: string
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

onMounted(() => {
  emit('beforeLoading')
  emit('afterLoading')
})

interface Discussion {
  id: number
  title: string
  author: string
  forum: string
  replies: number
  likes: number
  time: string
}

const discussions: Discussion[] = [
  { id: 1, title: '求助 P1001 为什么会 RE？？？', author: 'luogu_user', forum: '问题求助', replies: 15, likes: 23, time: '2小时前' },
  { id: 2, title: '分享一下我的算法学习路线', author: 'code_master', forum: '个人分享', replies: 68, likes: 256, time: '5小时前' },
  { id: 3, title: '关于 C++14 和 C++17 在竞赛中的使用建议', author: 'cpp_expert', forum: '技术讨论', replies: 32, likes: 78, time: '8小时前' },
  { id: 4, title: '2026 NOI 系列赛事日程安排集合', author: 'admin_team', forum: '公告', replies: 12, likes: 340, time: '1天前' },
  { id: 5, title: '动态规划从入门到精通，附精选题目列表', author: 'dp_lover', forum: '个人分享', replies: 45, likes: 189, time: '1天前' },
  { id: 6, title: '考场上 STL 的使用技巧', author: 'oi_er', forum: '个人分享', replies: 27, likes: 134, time: '2天前' },
  { id: 7, title: '洛谷主题库题目难度标注建议收集帖', author: 'reviewer', forum: '反馈建议', replies: 56, likes: 89, time: '2天前' },
  { id: 8, title: '线段树进阶：可持久化线段树详解', author: 'tree_master', forum: '学术讨论', replies: 41, likes: 203, time: '3天前' },
]
</script>

<template>
  <div>
    <div
      style="backdrop-filter: var(--bew-filter-glass-1)"
      bg="$bew-content"
      rounded="12px"
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 solid $bew-border-color"
      p="16px"
      mb="16px"
    >
      <div mb-4>
        <h2 text="base $bew-text-1" fw-bold>
          最近讨论
        </h2>
        <p text="xs $bew-text-3" mt-1>
          社区最新讨论和分享
        </p>
      </div>

      <div flex="~ col" gap-3>
        <div
          v-for="disc in discussions"
          :key="disc.id"
          class="discussion-card"
          bg="$bew-fill-1"
          rounded="8px"
          p-3
          cursor-pointer
          shadow="[var(--bew-shadow-1)]"
          border="1 solid $bew-border-color"
          duration-300
        >
          <div flex="~ items-center justify-between wrap gap-2" mb-1>
            <span
              text="xs $bew-theme-color"
              px-2
              py-1
              rounded-full
              bg="$bew-theme-color-10"
              fw-600
            >
              {{ disc.forum }}
            </span>
            <span text="xs $bew-text-4">
              {{ disc.time }}
            </span>
          </div>

          <h3 text="sm $bew-text-1" fw-bold mb-2>
            {{ disc.title }}
          </h3>

          <div flex="~ items-center gap-4 wrap" text="xs $bew-text-3">
            <div flex="~ items-center gap-1">
              <span v-html="renderIcon('mingcute:user-4-line', 14)" style="display:contents" />
              <span>{{ disc.author }}</span>
            </div>
            <div flex="~ items-center gap-1">
              <span v-html="renderIcon('mingcute:comment-line', 14)" style="display:contents" />
              <span>{{ disc.replies }} 回复</span>
            </div>
            <div flex="~ items-center gap-1">
              <span v-html="renderIcon('mingcute:heart-line', 14)" style="display:contents" />
              <span>{{ disc.likes }} 赞</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.discussion-card {
  backdrop-filter: var(--bew-filter-glass-1);
  transition: box-shadow 200ms ease, transform 200ms ease;

  &:hover {
    box-shadow: var(--bew-shadow-2) !important;
    transform: translateY(-2px);
  }
}
</style>
