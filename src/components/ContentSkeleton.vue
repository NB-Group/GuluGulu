<script setup lang="ts">
defineProps<{ lines?: number, card?: boolean }>()
</script>

<template>
  <div class="content-skeleton" pointer-events-none select-none>
    <!-- Card skeleton -->
    <div v-if="card" mb-4>
      <div class="shimmer-block" aspect-video rounded="12px" />
      <div flex mt-4>
        <div class="shimmer-block" m="r-3" w="32px" h="32px" rounded-full shrink-0 />
        <div w="[calc(100%-44px)]">
          <div class="shimmer-block" w-full h-4 rounded-4 mb-2 />
          <div class="shimmer-block" w="3/4" h-4 rounded-4 mb-3 />
          <div class="shimmer-block" w="40%" h-3 rounded-4 />
        </div>
      </div>
    </div>
    <!-- Line skeleton -->
    <div v-else flex="~ col" gap-3>
      <div v-for="i in (lines || 5)" :key="i" flex="~ items-center gap-3">
        <div class="shimmer-block" w="24px" h="24px" rounded-full shrink-0 />
        <div flex-1>
          <div class="shimmer-block" w-full h-4 rounded-4 mb-1 />
          <div class="shimmer-block" w="60%" h-3 rounded-4 />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.shimmer-block {
  background: linear-gradient(100deg, var(--bew-fill-1) 30%, var(--bew-fill-2) 50%, var(--bew-fill-1) 70%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
</style>
