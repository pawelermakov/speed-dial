<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
const props = defineProps<{ open: boolean; query: string; disabled: boolean }>();
const emit = defineEmits<{ open: []; close: [restoreFocus?: boolean]; 'update:query': [value: string] }>();
const input = ref<HTMLInputElement>();
const button = ref<HTMLButtonElement>();
const field = ref<HTMLElement>();
let closeTimer: ReturnType<typeof setTimeout> | undefined;
function outside(event: MouseEvent) {
  if ((event.target as Element).closest?.('[data-bookmark-search-open], a.bookmark')) return;
  if (!props.open || props.disabled || !field.value || field.value.contains(event.target as Node)) return;
  // Let links and controls finish their click before replacing the results.
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => { if (props.open && !props.disabled) emit('close', false); }, 0);
}
onMounted(() => document.addEventListener('click', outside));
onUnmounted(() => { document.removeEventListener('click', outside); clearTimeout(closeTimer); });
async function focus() { await nextTick(); input.value?.focus(); }
async function restoreFocus() { await nextTick(); button.value?.focus(); }
defineExpose({ focus, restoreFocus });
</script>
<template>
  <div class="bookmark-search absolute inset-0 flex items-center justify-end min-w-0 pointer-events-none">
    <button v-if="!open" ref="button" data-bookmark-search-open type="button" class="p-2 rounded bg-white/80 shrink-0 pointer-events-auto" title="Поиск по закладкам" aria-label="Поиск по закладкам" :disabled="disabled" @click="emit('open')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
    </button>
    <div v-else ref="field" class="relative w-full md:w-[30vw] max-w-full pointer-events-auto">
      <input ref="input" type="text" role="searchbox" class="min-w-0 w-full h-9 rounded bg-white/90 py-2 pl-3 pr-10" aria-label="Найти закладку" placeholder="Название или URL" :value="query" :disabled="disabled" @input="emit('update:query', ($event.target as HTMLInputElement).value)" />
      <button type="button" class="absolute inset-y-0 right-0 w-9 flex items-center justify-center rounded-r text-black/60 hover:text-black" title="Закрыть поиск" aria-label="Закрыть поиск по закладкам" :disabled="disabled" @click="emit('close')">×</button>
    </div>
  </div>
</template>
