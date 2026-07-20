<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'
import Loading from '~/components/Loading.vue'

defineProps<{
  solutions: Array<{ id: number, title: string, author: any, time: number, votes: number }>
  solutionsLoading: boolean
  problemId: string
}>()

const { navigateTo } = useGulyApp()
</script>

<template>
  <div
    bg="$bew-content" rounded="$bew-radius" p-6
    shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
    border="1 $bew-border-color"
    style="backdrop-filter: var(--bew-filter-glass-1)"
  >
    <Loading v-if="solutionsLoading" />
    <div
      v-else-if="solutions.length === 0" flex="~ col" items="center" justify="center" py-12
      text="$bew-text-2"
    >
      <span style="display:contents" v-html="renderIcon('mingcute:bulb-line', 48)" />
      <p text="lg" mt-4 mb-2>
        暂无题解
      </p>
      <p text="sm $bew-text-3" mb-4>
        这道题目还没有题解
      </p>
    </div>
    <div v-else>
      <h2 mb-4 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)">
        题解 ({{ solutions.length }})
      </h2>
      <div
        v-for="(s, idx) in solutions" :key="s.id"
        class="stagger-row hover:bg-$bew-fill-2"
        :style="{ '--row-index': idx }"
        p="x-4 y-3" flex="~ items-center gap-4"
        border="b-1 $bew-border-color" cursor="pointer" duration-200
        @click="navigateTo(AppPage.Solution, `https://www.luogu.com.cn/problem/solution/${problemId}?sid=${s.id}`)"
      >
        <div flex="1" min-w-0>
          <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            {{ s.title }}
          </div>
          <div flex="~ items-center gap-2" mt-1>
            <img :src="s.author?.avatar" style="width:20px;height:20px;border-radius:50%;object-fit:cover" @error="(e:any) => { e.target.style.display = 'none' }">
            <span text="xs" :style="{ color: s.author?.color ? `var(--bew-${s.author.color})` : 'var(--bew-text-2)' }">{{ s.author?.name }}</span>
            <span text="xs $bew-text-3">{{ timeAgo(s.time) }}</span>
          </div>
        </div>
        <div flex="~ items-center gap-1" shrink-0 text="sm $bew-text-3">
          <span style="display:contents" v-html="renderIcon('mingcute:thumb-up-line', 14)" />
          {{ s.votes }}
        </div>
      </div>
    </div>
  </div>
</template>
