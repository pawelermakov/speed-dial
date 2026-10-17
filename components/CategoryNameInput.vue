<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
const props = defineProps<{ title?: string; disabled: boolean }>();
const emit = defineEmits<{ save: [title: string]; cancel: [] }>();
const draft = ref(props.title ?? '');
const editor = ref<HTMLSpanElement>();
const input = ref<HTMLInputElement>();
const measure = ref<HTMLSpanElement>();
function finish() {
  if (props.disabled) return;
  const title = draft.value.trim();
  if (!title || title === props.title) emit('cancel');
  else emit('save', title);
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !editor.value?.contains(event.target)) finish();
}
onMounted(() => {
  input.value?.focus();
  if (props.title !== undefined) input.value?.select();
  document.addEventListener('pointerdown', outside, true);
});
onUnmounted(() => document.removeEventListener('pointerdown', outside, true));
function resize(event: Event) {
  const field = event.target as HTMLInputElement;
  if (!measure.value) return;
  measure.value.textContent = field.value || ' ';
  if (measure.value.scrollWidth <= field.clientWidth) field.scrollLeft = 0;
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing || !['Enter', 'Escape'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  if (props.disabled) return;
  if (event.key === 'Escape') emit('cancel');
  else if (draft.value.trim()) finish();
}
</script>
<template>
  <span ref="editor" class="inline-flex items-center gap-1 max-w-full">
  <span class="relative inline-grid min-w-24 rounded bg-white/80 text-base font-normal leading-[normal]">
    <span ref="measure" aria-hidden="true" class="invisible overflow-hidden whitespace-pre py-2 pl-2 pr-3 [grid-area:1/1]">{{ draft || ' ' }}</span>
    <input ref="input" v-model="draft" class="absolute inset-0 w-full min-w-0 p-2 rounded bg-transparent focus-visible:outline-1 focus-visible:outline-[#54565a] focus-visible:outline-offset-2" :aria-label="title === undefined ? 'Название новой категории' : 'Название категории'" placeholder="Название" maxlength="4096" :disabled="disabled" @input="resize" @keydown="keydown" />
  </span>
    <button type="button" class="inline-flex items-center justify-center size-[calc(1lh+1rem)] shrink-0 rounded bg-white/80" aria-label="Применить название категории" title="Применить (Enter)" :disabled="disabled || !draft.trim()" @click="finish">✓</button>
    <button type="button" class="inline-flex items-center justify-center size-[calc(1lh+1rem)] shrink-0 rounded bg-white/80" aria-label="Отменить изменение категории" title="Отменить (Esc)" :disabled="disabled" @click="emit('cancel')">×</button>
  </span>
</template>
