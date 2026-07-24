<script setup lang="ts">
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'
import { renderIcon } from '~/utils/icons'

defineProps<{ size?: 'sm' | 'md' | 'lg' }>()
const { navigateTo } = useGuluApp()

// 洛谷总通过题数:`/user/mine/practice` 不存在(mine 不带 practice 子路由),
// 先用 /user/mine?_contentOnly=1 解析当前 uid,再读个人主页的 passedProblemCount。
const passed = ref(0)
const submitted = ref(0)
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
    // 个人主页 lentille.data.passedProblemCount = 洛谷总通过题数
    const res = await fetch(`${location.origin}/user/${uid}?_contentOnly=1`, { credentials: 'same-origin' })
    if (res.ok) {
      const j = await res.json()
      const d = j?.data || {}
      passed.value = Number(d.passedProblemCount) || 0
      submitted.value = Number(d.submittedProblemCount) || 0
    }
  }
  catch (e) { console.warn('[GuluGulu]', e) }
  loading.value = false
}

function openProfile() {
  navigateTo(AppPage.MyProblems, `${location.origin}/user/mine/problem`)
}
onMounted(fetchList)
defineExpose({ initData: fetchList })
</script>

<template>
  <Loading v-if="loading" />
  <div v-else flex="~ col gap-2" h-full justify-center>
    <div flex="~ items-baseline gap-2">
      <span style="font-size:2.1em;font-weight:800;color:var(--bew-theme-color);line-height:1;letter-spacing:-.02em">{{ passed }}</span>
      <span style="font-size:.82em;color:var(--bew-text-2);font-weight:600">题已通过</span>
    </div>
    <div style="font-size:.76em;color:var(--bew-text-3)">
      共尝试 <span style="color:var(--bew-text-2);font-weight:600">{{ submitted }}</span> 题
      <span v-if="submitted > 0">· 通过率 {{ submitted > 0 ? Math.round(passed / submitted * 100) : 0 }}%</span>
    </div>
    <button class="start-row" mt-1 flex="~ items-center justify-center gap-1" bg="$bew-fill-1" rounded="8px" p="y-2" border="1 solid transparent" cursor-pointer @click="openProfile">
      <span style="display:contents" v-html="renderIcon('mingcute:edit-line', 14)" />
      <span style="font-size:.82em;color:var(--bew-text-2);font-weight:600">继续刷题</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.start-row {
  transition: border-color var(--bew-dur-fast) ease, background var(--bew-dur-fast) ease;
  &:hover { border-color: var(--bew-theme-color-40); background: var(--bew-fill-2); }
}
</style>
