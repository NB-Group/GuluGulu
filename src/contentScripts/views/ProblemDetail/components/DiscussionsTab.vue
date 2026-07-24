<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'

defineProps<{
  discussions: Array<{ id: number, title: string, author: any, time: number, replyCount: number }>
}>()

const { navigateTo } = useGuluApp()
</script>

<template>
  <div
    bg="$bew-content" rounded="$bew-radius" p-6
    shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
    border="1 $bew-border-color"
    style="backdrop-filter: var(--bew-filter-glass-1)"
  >
    <div
      v-if="discussions.length === 0" flex="~ col" items="center" justify="center" py-12
      text="$bew-text-2"
    >
      <span style="display:contents" v-html="renderIcon('mingcute:comment-line', 48)" />
      <p text="lg" mt-4 mb-2>
        暂无讨论
      </p>
      <p text="sm $bew-text-3" mb-4>
        这道题目还没有人发起讨论
      </p>
    </div>
    <div v-else>
      <div
        v-for="(d, idx) in discussions" :key="d.id"
        class="stagger-row hover:bg-$bew-fill-2"
        :style="{ '--row-index': idx }"
        p="x-4 y-3" flex="~ items-center gap-4"
        border="b-1 $bew-border-color" cursor="pointer" duration-200
        @click="navigateTo(AppPage.Blog, `${location.origin}/discuss/${d.id}`)"
      >
        <div flex="~ items-center gap-2" shrink-0>
          <img :src="d.author?.avatar" style="width:24px;height:24px;border-radius:50%;object-fit:cover" @error="(e:any) => { e.target.style.display = 'none' }">
          <span :style="{ color: d.author?.color ? `var(--bew-${d.author.color})` : 'var(--bew-text-1)', fontWeight: 600, fontSize: 'var(--bew-base-font-size)' }">{{ d.author?.name }}</span>
        </div>
        <div flex="1" min-w-0>
          <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            {{ d.title }}
          </div>
        </div>
        <div flex="~ items-center gap-2" shrink-0 style="font-size:.8em;color:var(--bew-text-3)">
          <span flex="~ items-center gap-1"><span style="display:contents" v-html="renderIcon('mingcute:comment-line', 14)" />{{ d.replyCount }}</span>
          <span>{{ timeAgo(d.time) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
