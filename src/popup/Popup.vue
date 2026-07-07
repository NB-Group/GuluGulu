<script setup lang="ts">
function openOptionsPage() {
  browser.runtime.openOptionsPage()
}

function openLuogu() {
  window.open('https://www.luogu.com.cn/', '_blank')
}
</script>

<template>
  <main class="w-[300px] px-4 py-5 text-center text-gray-700 dark:text-gray-200">
    <div text="xl" fw-bold mb-2>
      GulyGuly
    </div>
    <p class="mt-2 opacity-50">
      Luogu beautifier
    </p>
    <button class="btn mt-2" p="x-4 y-2" rounded="$bew-radius-half" bg="$bew-theme-color" text="white" cursor-pointer border-none duration-300 hover:opacity-80 @click="openLuogu">
      Open Luogu
    </button>
    <button class="btn mt-2" p="x-4 y-2" rounded="$bew-radius-half" bg="$bew-fill-2" text="$bew-text-1" cursor-pointer border-none duration-300 hover:opacity-80 ml-2 @click="openOptionsPage">
      Options
    </button>
  </main>
</template>
