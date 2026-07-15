<script setup lang="ts">
import { AppPage } from '~/enums/appEnums'
import { useGulyApp } from '~/composables/useAppProvider'

const { navigateTo } = useGulyApp()
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
  navigateTo(AppPage.ProblemDetail, `https://www.luogu.com.cn/problem/${pid}`)
}

function handleRandom() {
  navigateTo(AppPage.ProblemDetail, 'https://www.luogu.com.cn/problem/random')
}

function handleKeyup(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    handleGo()
  }
}
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1)"
    bg="$bew-content"
    rounded="12px"
    shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
    border="1 solid $bew-border-color"
    p="16px"
  >
    <h3 text="sm $bew-text-1" fw-bold mb-3>
      问题跳转
    </h3>

    <div flex="~ col" gap-2>
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
          bg="$bew-error-color" text="sm white"
          px-4 py-1.5 rounded-full cursor-pointer fw-bold
          flex-1 duration-300
          @click="handleGo"
        >
          跳转
        </button>
        <button
          class="jump-btn"
          bg="$bew-theme-color" text="sm white"
          px-4 py-1.5 rounded-full cursor-pointer fw-bold
          flex-1 duration-300
          @click="handleRandom"
        >
          随机跳题
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.problem-input-wrapper {
  transition: border-color 200ms ease;

  &:focus-within {
    border-color: var(--bew-theme-color);
  }
}

.problem-input {
  &::placeholder {
    color: var(--bew-text-4);
  }
}

.jump-btn {
  transition: all 200ms ease;

  &:hover {
    filter: brightness(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
}
</style>
