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
  <div class="bookmark-search absolute inset-0 flex items-start justify-end min-w-0 pointer-events-none">
    <div ref="field" class="bookmark-search-field ui-control relative h-11 max-w-full pointer-events-auto" :class="{'is-open':open}">
      <button ref="button" data-bookmark-search-open type="button" class="bookmark-search-trigger absolute right-0 top-0 size-11 inline-flex items-center justify-center" :class="{'pointer-events-none':open}" :aria-hidden="open||undefined" :tabindex="open?-1:undefined" title="Поиск по закладкам" aria-label="Поиск по закладкам" :disabled="disabled" @click="emit('open')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
      </button>
      <input ref="input" type="text" role="searchbox" class="bookmark-search-input absolute right-0 top-0 min-w-0 w-full h-full pl-3 pr-11" :inert="!open" :aria-hidden="!open||undefined" :tabindex="open?undefined:-1" aria-label="Найти закладку" placeholder="Название или URL" :value="query" :disabled="disabled" @input="emit('update:query', ($event.target as HTMLInputElement).value)" />
    </div>
  </div>
</template>
<style scoped>
.bookmark-search-field{width:44px;transition:width 170ms cubic-bezier(.2,0,0,1);}
.bookmark-search-field.is-open{width:100%;transition-delay:80ms;}
.bookmark-search-field:focus-within{box-shadow:0 0 0 2px rgb(var(--ui-accent-rgb) / .25);}
.bookmark-search-trigger{border:0;background:transparent;}
.bookmark-search-field:not(.is-open):has(.bookmark-search-trigger:enabled):hover{background-color:var(--ui-accent-soft);}
.bookmark-search-input{border:0;background:transparent;border-radius:inherit;opacity:0;pointer-events:none;transition:opacity 60ms ease-out;}
.bookmark-search-input:focus-visible{box-shadow:none;}
.is-open .bookmark-search-input{opacity:1;pointer-events:auto;transition-delay:190ms;}
@media(min-width:768px){.bookmark-search-field.is-open{width:30vw;}}
@media(prefers-reduced-motion:reduce){.bookmark-search-field,.bookmark-search-input{transition:none;transition-delay:0ms;}}
</style>
