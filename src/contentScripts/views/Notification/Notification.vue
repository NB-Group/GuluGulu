<script setup lang="ts">
import { renderIcon } from '~/utils/icons'
import { timeAgo } from '~/utils/main'

const items = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await fetch('https://www.luogu.com.cn/user/notification', { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const raw = JSON.parse(m[1])?.data?.notifications
      items.value = Array.isArray(raw) ? raw : raw?.result || []
    }
  }
  catch {}
  loading.value = false
})
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16">
    <div
      bg="$bew-content" rounded="$bew-radius" p-6 mb-6 shadow="[var(--bew-shadow-1)]"
      border="1 $bew-border-color"
    >
      <h1 style="font-size: 1.5rem; color: var(--bew-text-1); font-weight: 700">
        通知
      </h1>
    </div>
    <Loading v-if="loading" />
    <Transition name="content-reveal">
      <div
        v-if="!loading && items.length > 0"
        bg="$bew-content"
        rounded="$bew-radius"
        shadow="[var(--bew-shadow-1)]"
        border="1 $bew-border-color"
        overflow="hidden"
      >
        <div
          v-for="(n, idx) in items"
          :key="n.id || idx"
          class="stagger-row hover:bg-$bew-fill-2"
          :style="{ '--row-index': idx }"
          p="x-6 y-3.5"
          border="b-1 $bew-border-color"
        >
          <div
            style="font-size: var(--bew-base-font-size); color: var(--bew-text-1)"
            v-html="n.content || n.title || n.text"
          />
          <div style="font-size: 0.8em; color: var(--bew-text-3)" mt-1>
            {{ timeAgo(n.time || 0) }}
          </div>
        </div>
      </div>
    </Transition>
    <div
      v-if="!loading && items.length === 0"
      bg="$bew-content"
      rounded="$bew-radius"
      p-8
      text="center $bew-text-3"
      border="1 $bew-border-color"
    >
      <span style="display: contents" v-html="renderIcon('mingcute:notification-line', 48)" />
      <p mt-2>
        暂无通知
      </p>
    </div>
  </div>
</template>
