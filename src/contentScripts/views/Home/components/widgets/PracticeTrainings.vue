<script setup lang="ts">
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'
import { renderIcon } from '~/utils/icons'

defineProps<{ size?: 'sm' | 'md' | 'lg' }>()
const { navigateTo } = useGuluApp()

// 练习进度:`/user/mine/practice` 不存在(mine 不带 practice 子路由),
// 先用 `/user/mine` 解析当前登录 uid,再请求 `/user/{uid}/practice`。
const passed = ref(0)
const submitted = ref(0)
const total = ref(0)
const loading = ref(true)

async function resolveUid(): Promise<number | null> {
  try {
    const res = await fetch(`${location.origin}/user/mine?_contentOnly=1`, { credentials: 'same-origin' })
    if (!res.ok)
      return null
    const j = await res.json()
    return Number(j?.currentUser?.uid) || Number(j?.user?.uid) || null
  }
  catch { return null }
}

async function fetchList() {
  loading.value = true
  try {
    const uid = await resolveUid()
    if (!uid) { loading.value = false; return }
    const res = await fetch(`${location.origin}/user/${uid}/practice`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"[^>]*>([^<]+)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const count = (v: any) => {
        if (!v)
          return 0
        if (typeof v === 'number')
          return v
        return Array.isArray(v) ? v.length : (v.result?.length || v.count || 0)
      }
      passed.value = count(ctx?.data?.passedCount ?? ctx?.data?.passed)
      submitted.value = count(ctx?.data?.submittedCount ?? ctx?.data?.submitted)
      // 通过率分母:提交过的题目数(没有就退回 passed)
      total.value = submitted.value || passed.value
    }
  }
  catch (e) { console.warn('[GuluGulu]', e) }
  loading.value = false
}

function pct(p: number, t: number) { return t > 0 ? Math.min(100, Math.round((p / t) * 100)) : 0 }
function openPractice() {
  // 跳到「我的题目」作为练习入口(无独立练习列表页)
  navigateTo(AppPage.MyProblems, `${location.origin}/user/mine/problem`)
}
onMounted(fetchList)
defineExpose({ initData: fetchList })
</script>

<template>
  <Loading v-if="loading" />
  <div v-else flex="~ col gap-3" h-full justify-center>
    <div flex="~ items-baseline gap-2">
      <span style="font-size:1.8em;font-weight:800;color:var(--bew-theme-color);line-height:1">{{ passed }}</span>
      <span style="font-size:.8em;color:var(--bew-text-3)">已通过</span>
      <span flex-1 />
      <span style="font-size:.78em;color:var(--bew-text-3)">{{ submitted }} 题提交过</span>
    </div>
    <div style="height:8px;background:var(--bew-fill-3);border-radius:999px;overflow:hidden">
      <div :style="{ height:'100%', width: pct(passed, total)+'%', background:'var(--bew-theme-color)', transition:'width .5s ease' }" />
    </div>
    <button class="start-row" flex="~ items-center justify-center gap-1" bg="$bew-fill-1" rounded="8px" p="y-2" border="1 solid transparent" cursor-pointer @click="openPractice">
      <span style="display:contents" v-html="renderIcon('mingcute:edit-line', 14)" />
      <span style="font-size:.82em;color:var(--bew-text-2);font-weight:600">继续练习</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.start-row {
  transition: border-color var(--bew-dur-fast) ease, background var(--bew-dur-fast) ease;
  &:hover { border-color: var(--bew-theme-color-40); background: var(--bew-fill-2); }
}
</style>
