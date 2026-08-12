<script setup lang="ts">
import { AppPage } from '~/enums/appEnums'
import { useGuluApp } from '~/composables/useAppProvider'

// widget 版题目跳转:复用 Sidebar ProblemJumper 的逻辑,去掉自带卡片框
// (widget-card 已提供 bg/border/shadow/padding),并接 size prop 以匹配 widget 契约。
defineProps<{ size?: 'sm' | 'md' | 'lg' }>()

const { navigateTo } = useGuluApp()
const problemId = ref('')

function normalizeProblemId(input: string): string {
  const trimmed = input.trim()
  if (!trimmed)
    return ''
  if (/^\d+$/.test(trimmed))
    return `P${trimmed}`
  return trimmed.toUpperCase()
}

function handleGo() {
  const pid = normalizeProblemId(problemId.value)
  if (!pid)
    return
  navigateTo(AppPage.ProblemDetail, `${location.origin}/problem/${pid}`)
}

async function handleRandom() {
  // /problem/random 服务端 302 到真实题号;fetch 解析最终 URL 再 SPA 跳转,
  // 失败则整页刷新走原生 302。
  try {
    const res = await fetch(location.origin + '/problem/random', { credentials: 'same-origin', redirect: 'follow' })
    const pid = res.url.match(/\/problem\/(\w+)/)?.[1]
    if (pid)
      navigateTo(AppPage.ProblemDetail, res.url)
    else
      window.location.href = location.origin + '/problem/random'
  }
  catch {
    window.location.href = location.origin + '/problem/random'
  }
}

function handleKeyup(event: KeyboardEvent) {
  if (event.key === 'Enter')
    handleGo()
}
</script>

<template>
  <div flex="~ col gap-2" h-full justify="center">
    <div
      class="problem-input-wrapper"
      flex="~ items-center"
      bg="$bew-fill-1" rounded-full
      border="1 solid $bew-border-color"
      overflow-hidden
    >
      <input
        v-model="problemId"
        type="text"
        placeholder="例：P1001"
        class="problem-input"
        bg="transparent" text="sm $bew-text-1"
        px-3 py-1.5 flex-1 min-w-0 outline-none
        @keyup="handleKeyup"
      >
    </div>

    <div flex="~ gap-2">
      <button
        class="jump-btn"
        bg="$bew-theme-color" text="sm white"
        px-4 py-1.5 rounded-full cursor-pointer fw-bold
        flex-1 duration-300
        @click="handleGo"
      >
        跳转
      </button>
      <button
        class="jump-btn"
        bg="$bew-error-color" text="sm white"
        px-4 py-1.5 rounded-full cursor-pointer fw-bold
        flex-1 duration-300
        @click="handleRandom"
      >
        随机跳题
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.problem-input-wrapper {
  transition: border-color var(--bew-dur-fast) ease;
  &:focus-within { border-color: var(--bew-theme-color); }
}
.problem-input {
  &::placeholder { color: var(--bew-text-4); }
}
.jump-btn {
  transition: all var(--bew-dur-fast) ease;
  &:hover { filter: brightness(1.1); }
  &:active { transform: scale(0.95); }
}
</style>
