<script setup lang="ts">
import { useGulyApp } from '~/composables/useAppProvider'
import { AppPage } from '~/enums/appEnums'
import { diffColor, diffLabel } from '~/utils/difficulty'
import { renderIcon } from '~/utils/icons'

const props = withDefaults(defineProps<{ embedded?: boolean, uid?: number | null }>(), { embedded: false, uid: null })
const { navigateTo, currentUrl } = useGulyApp()
const uid = computed(() => {
  if (props.uid)
    return props.uid
  const m = (currentUrl.value || document.URL).match(/\/user\/(\d+)\/practice/)
  return m ? Number(m[1]) : null
})
const passed = ref<any[]>([])
const submitted = ref<any[]>([])
const loading = ref(true)

function openProblem(pid: string) { navigateTo(AppPage.ProblemDetail, `https://www.luogu.com.cn/problem/${pid}`) }

onMounted(async () => {
  if (!uid.value) { loading.value = false; return }
  try {
    const res = await fetch(`https://www.luogu.com.cn/user/${uid.value}/practice`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const p = ctx?.data?.passed
      passed.value = Array.isArray(p) ? p : (p?.result || [])
      const s = ctx?.data?.submitted
      submitted.value = Array.isArray(s) ? s : (s?.result || [])
    }
  }
  catch (e) { console.warn('[GuluGulu]', e) }
  loading.value = false
})
</script>

<template>
  <div :class="{ 'page-container': !props.embedded, 'embed-root--embedded': props.embedded }" w-full h-full :p="props.embedded ? '' : 'x-4 md:x-8 lg:x-16'">
    <div
      v-if="!props.embedded" bg="$bew-content" rounded="$bew-radius" p-6 mb-6
      shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color"
    >
      <h1 style="font-size:1.5rem;color:var(--bew-text-1);font-weight:700">
        练习情况
      </h1>
    </div>
    <Loading v-if="loading" />
    <Transition name="content-reveal">
      <div
        v-if="!loading && passed.length > 0" class="embed-list-card" :class="{ 'embed-list-card--embedded': props.embedded }" bg="$bew-content" rounded="$bew-radius"
        shadow="[var(--bew-shadow-1)]" border="1 $bew-border-color" overflow="hidden" mb-6
      >
        <div class="embed-list-header" p="x-6 y-3" bg="$bew-fill-1" style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:700">
          已通过 {{ passed.length }} 题
        </div>
        <div :class="{ 'embed-list-body': props.embedded }">
          <div
            v-for="(p, idx) in passed" :key="p.pid" class="stagger-row hover:bg-$bew-fill-2" :style="{ '--row-index': idx }" flex="~ items-center"
            p="x-6 y-3" border="b-1 $bew-border-color" cursor="pointer" @click="openProblem(p.pid)"
          >
            <span style="width:80px;font-family:monospace;font-size:.85em;color:var(--bew-text-3);flex-shrink:0">{{ p.pid }}</span>
            <span flex-1 style="font-size:var(--bew-base-font-size);color:var(--bew-text-1)">{{ p.name }}</span>
            <span text="xs" px-2 py-0.5 rounded-full :style="{ background: `${diffColor(p.difficulty || 0)}20`, color: diffColor(p.difficulty || 0) }">{{ diffLabel(p.difficulty || 0) }}</span>
          </div>
        </div>
      </div>
    </Transition>
    <div
      v-if="!loading && passed.length === 0 && submitted.length === 0" bg="$bew-content" rounded="$bew-radius" p-8 text="center $bew-text-3"
      border="1 $bew-border-color"
    >
      <span style="display:contents" v-html="renderIcon('mingcute:chart-bar-line', 48)" /><p mt-2>
        暂无练习记录
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* When embedded in UserProfile's tab, make the list scroll INTERNALLY:
   header stays pinned, only the rows body scrolls — instead of the whole
   table riding along with the outer tab-scroll area.
   The CARD is bounded to fit the tab area (so the outer tab-scroll does NOT
   also scroll → no double scrollbar); the body fills what's left and scrolls. */
.embed-root--embedded {
  /* Flex-chain fill: .gh-tab-scroll is now a flex column, so flex:1 here
     makes the root fill the tab area exactly (no percentage-height needed). */
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.embed-list-card--embedded {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  margin-bottom: 0; /* override mb-6 so the card fits the tab area exactly */
}
.embed-list-card--embedded > .embed-list-header {
  flex-shrink: 0;
}
.embed-list-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* Scrollbar hidden — matches the project-wide convention. */
}
</style>
