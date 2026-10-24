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
    <div ref="field" class="bookmark-search-field ui-control relative h-12 max-w-full pointer-events-auto" :class="{'is-open':open}">
      <button ref="button" data-bookmark-search-open type="button" class="bookmark-search-trigger absolute inset-0 size-full inline-flex items-center justify-center" :class="{'pointer-events-none':open}" :aria-hidden="open||undefined" :tabindex="open?-1:undefined" title="Поиск по закладкам" aria-label="Поиск по закладкам" :disabled="disabled" @click="emit('open')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
      </button>
      <input ref="input" type="text" role="searchbox" class="bookmark-search-input absolute right-0 top-0 min-w-0 w-full h-full pl-3 pr-12" :inert="!open" :aria-hidden="!open||undefined" :tabindex="open?undefined:-1" aria-label="Найти закладку" placeholder="Название или URL" :value="query" :disabled="disabled" @input="emit('update:query', ($event.target as HTMLInputElement).value)" />
      <button type="button" :inert="!open" :aria-hidden="!open||undefined" :tabindex="open?undefined:-1" class="bookmark-search-close absolute right-[5px] top-1/2 -translate-y-1/2 size-9 inline-flex items-center justify-center rounded-[var(--radius-sm)] ui-hover" aria-label="Закрыть поиск по закладкам" :disabled="disabled" @click="emit('close',true)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </div>
  </div>
</template>
<style scoped>
.bookmark-search{padding-top:var(--space-1);}
.bookmark-search-field{width:48px;transition:width var(--motion-fast) var(--ease-state),background-color var(--motion-fast) var(--ease-state);}
.bookmark-search-field.is-open{width:100%;transition-delay:var(--motion-fast),var(--motion-fast);}
.bookmark-search-trigger{border:0;border-radius:inherit;background:transparent;transition:opacity var(--motion-fast) var(--ease-state) var(--motion-fast);}
.is-open .bookmark-search-trigger{opacity:0;transition-delay:var(--motion-fast);}
.bookmark-search-close{opacity:0;pointer-events:none;transition:opacity var(--motion-fast) var(--ease-state),background-color var(--motion-fast) var(--ease-state);}
.is-open .bookmark-search-close{opacity:1;pointer-events:auto;transition-delay:var(--motion-fast),0ms;}
.bookmark-search-input{border:0;background:transparent;border-radius:inherit;opacity:0;pointer-events:none;transition:opacity var(--motion-fast) var(--ease-state);}
.bookmark-search-input:focus-visible{box-shadow:none;}
.is-open .bookmark-search-input{opacity:1;pointer-events:auto;transition-delay:var(--motion-fast);}
@media(min-width:768px){.bookmark-search-field.is-open{width:30vw;}}
@media(prefers-reduced-motion:reduce){.bookmark-search-field,.bookmark-search-input,.bookmark-search-trigger,.bookmark-search-close{transition:none;transition-delay:0ms;}}
</style>
