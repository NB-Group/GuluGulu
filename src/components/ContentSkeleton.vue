<script setup lang="ts">
defineProps<{ lines?: number, card?: boolean }>()
</script>

<template>
  <div pointer-events-none select-none>
    <!-- Card skeleton -->
    <div v-if="card" mb-4>
      <div aspect-video bg="$bew-skeleton" rounded="12px" />
      <div flex mt-4>
        <div
          m="r-3" w="32px" h="32px" rounded-full bg="$bew-skeleton"
          shrink-0
        />
        <div w="[calc(100%-44px)]">
          <div w-full h-4 bg="$bew-skeleton" rounded-4 mb-2 />
          <div w="3/4" h-4 bg="$bew-skeleton" rounded-4 mb-3 />
          <div w="40%" h-3 bg="$bew-skeleton" rounded-4 />
        </div>
      </div>
    </div>
    <!-- Line skeleton -->
    <div v-else flex="~ col" gap-3>
      <div v-for="i in lines || 5" :key="i" flex="~ items-center gap-3">
        <div w="24px" h="24px" rounded-full bg="$bew-skeleton" shrink-0 />
        <div flex-1>
          <div w-full h-4 bg="$bew-skeleton" rounded-4 mb-1 />
          <div w="60%" h-3 bg="$bew-skeleton" rounded-4 />
        </div>
      </div>
    </div>
  </div>
</template>
