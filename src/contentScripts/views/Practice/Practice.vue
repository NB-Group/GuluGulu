<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { diffLabel, diffColor } from '~/utils/difficulty'

const uid = computed(() => {
  const m = document.URL.match(/\/user\/(\d+)\/practice/)
  return m ? Number(m[1]) : null
})
const passed = ref<any[]>([])
const submitted = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  if (!uid.value) { loading.value = false; return }
  try {
    const res = await fetch(`https://www.luogu.com.cn/user/${uid.value}/practice`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      passed.value = ctx?.data?.passed?.result || []
      submitted.value = ctx?.data?.submitted?.result || []
    }
  } catch {}
  loading.value = false
})
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16">
    <div bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color">
      <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:700">练习情况</h1>
    </div>
    <Loading v-if="loading" />
    <Transition name="content-reveal">
      <div v-if="!loading && passed.length>0" bg="$bew-content" rounded="$bew-radius" shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" overflow="hidden" mb-6>
        <div p="x-6 y-3" bg="$bew-fill-1" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">已通过 {{ passed.length }} 题</div>
        <div v-for="(p, idx) in passed" :key="p.pid" class="stagger-row" :style="{'--row-index':idx}" flex="~ items-center" p="x-6 y-3" border="b-1 $bew-border-color">
          <span style="width:80px;font-family:monospace;font-size:.85em;color:var(--bew-text-3);flex-shrink:0">{{ p.pid }}</span>
          <span flex-1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1)">{{ p.title }}</span>
          <span text="xs" px-2 py-0.5 rounded-full :style="{background:diffColor(p.difficulty||0)+'20',color:diffColor(p.difficulty||0)}">{{ diffLabel(p.difficulty||0) }}</span>
        </div>
      </div>
    </Transition>
    <div v-if="!loading && passed.length===0 && submitted.length===0" bg="$bew-content" rounded="$bew-radius" p-8 text="center $bew-text-3" border="1 $bew-border-color">
      <span v-html="renderIcon('mingcute:chart-bar-line',48)" style="display:contents"/><p mt-2>暂无练习记录</p>
    </div>
  </div>
</template>
