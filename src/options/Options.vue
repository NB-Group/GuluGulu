<script setup lang="ts">
import { settings } from '~/logic/storage'

function openLuogu() {
  window.open('https://www.luogu.com.cn/', '_blank')
}
</script>

<template>
  <main class="px-4 py-10 text-center text-gray-700 dark:text-gray-200">
    <div text="2xl" fw-bold mb-2>
      GulyGuly
    </div>
    <p class="mt-2 opacity-50">
      Luogu beautifier - Options Page
    </p>
    <div class="mt-4">
      Powered by Vite <div i-logos:vitejs class="align-middle inline-block" />
    </div>
  </main>
</template>
