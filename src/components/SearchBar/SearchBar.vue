<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { ref } from 'vue'

import { renderIcon } from '~/utils/icons'
import { searchKeyword } from '~/utils/luogu-api'

const props = defineProps<{
  darkenOnFocus?: boolean
  blurredOnFocus?: boolean
}>()

const emit = defineEmits<{
  (e: 'search', keyword: string): void
}>()

const keywordRef = ref<HTMLInputElement>()
const isFocus = ref<boolean>(false)
const keyword = ref<string>('')

onKeyStroke('/', (e: KeyboardEvent) => {
  const target = e.target as HTMLElement
  const ignoreTagNames = ['INPUT', 'TEXTAREA']
  if (target && (ignoreTagNames.includes(target.tagName) || target.isContentEditable))
    return

  e.preventDefault()
  keywordRef.value?.focus()
})

onKeyStroke(
  'Escape',
  (e: KeyboardEvent) => {
    e.preventDefault()
    keywordRef.value?.blur()
    isFocus.value = false
  },
  { target: keywordRef },
)

function doSearch() {
  if (keyword.value.trim()) {
    searchKeyword.value = keyword.value.trim()
    emit('search', keyword.value.trim())
  }
}

function handleKeyEnter(e: KeyboardEvent) {
  if (!e.shiftKey && e.key === 'Enter' && !e.isComposing) {
    e.preventDefault()
    doSearch()
  }
}
</script>

<template>
  <div id="search-wrap" w="full" max-w="550px" h-46px pos="relative">
    <div
      v-if="!darkenOnFocus && isFocus"
      pos="fixed top-0 left-0"
      w="full"
      h="full"
      content="~"
      @click="isFocus = false"
    />
    <Transition name="mask">
      <div
        v-if="darkenOnFocus && isFocus"
        pos="fixed top-0 left-0"
        w-full
        h-full
        bg="black opacity-60"
        @click="isFocus = false"
      />
    </Transition>

    <div
      v-if="blurredOnFocus"
      pos="fixed top-0 left-0"
      w-full
      h-full
      duration-500
      pointer-events-none
      ease-out
      transform-gpu
      :style="{ backdropFilter: isFocus ? 'blur(15px)' : 'blur(0)' }"
    />

    <div class="search-bar group" :class="isFocus ? 'focus' : ''" flex="~ items-center" pos="relative" h-inherit>
      <input
        ref="keywordRef"
        v-model="keyword"
        class="group"
        rounded="9999px"
        p="l-6 r-18 y-3"
        h-inherit
        text="$b-search-bar-normal-text-color group-focus-within:$b-search-bar-focus-text-color group-hover:$b-search-bar-hover-text-color"
        un-border="1 solid $bew-border-color focus:$bew-theme-color"
        transition="all duration-300"
        type="text"
        placeholder="搜索题目..."
        @focus="isFocus = true"
        @keydown.enter.prevent="doSearch"
      >
      <button
        v-if="isFocus && keyword"
        type="button"
        pos="absolute right-12"
        bg="$bew-fill-1 hover:$bew-fill-2"
        text="xs"
        rounded-10
        p-1
        flex="~ items-center justify-between"
        @click="keyword = ''"
      >
        <span style="display: contents" v-html="renderIcon('mingcute:close-line', 14)" />
      </button>

      <button
        type="button"
        p-2
        rounded-full
        text="lg leading-0 $b-search-bar-normal-icon-color group-hover:$b-search-bar-hover-icon-color group-focus-within:$b-search-bar-focus-icon-color"
        transition="all duration-300"
        border-none
        outline-none
        pos="absolute right-6px"
        bg="hover:$bew-fill-2"
        filter="group-focus-within:~"
        style="--un-drop-shadow: drop-shadow(0 0 6px var(--bew-theme-color))"
        @click="doSearch"
      >
        <span style="display: contents" v-html="renderIcon('mingcute:search-line', 20)" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.mask-enter-active,
.mask-leave-active {
  transition: all 0.3s ease-in-out;
}

.mask-enter-from,
.mask-leave-to {
  --uno: "opacity-0";
}

.mask-enter-to,
.mask-leave-from {
  --uno: "opacity-100";
}

#search-wrap {
  --b-search-bar-normal-color: var(--bew-content);
  --b-search-bar-hover-color: var(--bew-content-hover);
  --b-search-bar-focus-color: var(--bew-content-hover);

  --b-search-bar-normal-icon-color: var(--bew-text-1);
  --b-search-bar-hover-icon-color: var(--bew-theme-color);
  --b-search-bar-focus-icon-color: var(--bew-theme-color);

  --b-search-bar-normal-text-color: var(--bew-text-1);
  --b-search-bar-hover-text-color: var(--bew-text-1);
  --b-search-bar-focus-text-color: var(--bew-text-1);

  .search-bar {
    input {
      font-size: 1rem;
      outline: none;
      width: 100%;
      background: var(--b-search-bar-normal-color);
      transform: translateZ(0);
      border: 1px solid var(--bew-border-color);
      box-shadow: var(--bew-shadow-2), var(--bew-shadow-edge-glow-1);
      backdrop-filter: var(--bew-filter-glass-1);

      &:hover {
        background: var(--b-search-bar-hover-color);
      }

      &:focus {
        background: var(--b-search-bar-focus-color);
      }
    }

    &.focus input {
      border-color: var(--bew-theme-color);
      box-shadow:
        0 0 0 2px var(--bew-theme-color),
        0 6px 16px var(--bew-theme-color-40),
        inset 0 0 6px var(--bew-theme-color-30);
    }
  }
}
</style>
