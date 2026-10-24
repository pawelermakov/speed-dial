<script setup lang="ts">
defineProps<{ title: string; closeLabel: string; busy?: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>
<template>
  <header class="panel-header relative shrink-0 border-b border-[var(--ui-border)] px-4 py-4 pr-12">
    <h2 class="text-xl font-semibold leading-[1.25]">{{ title }}</h2>
    <button type="button" class="close absolute right-4 top-1/2 -translate-y-1/2 size-9 inline-flex items-center justify-center rounded-[var(--ui-radius)] ui-hover" :aria-label="closeLabel" :disabled="busy" @click="emit('close')">
      <svg class="block size-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 0 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z"/></svg>
    </button>
  </header>
</template>
