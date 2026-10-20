<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import PanelHeader from './PanelHeader.vue';
const props = defineProps<{ title: string; busy?: boolean; wide?: boolean; bookmark?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
let previous: Element | null = null;
onMounted(() => { previous = document.activeElement; dialog.value?.showModal(); });
onUnmounted(() => {
  if (previous instanceof HTMLElement && previous.isConnected && !previous.matches(':disabled')) previous.focus();
  else document.querySelector<HTMLElement>('.page button:not(:disabled),.page a[href]')?.focus();
});
function close(event?: Event) {
  event?.preventDefault();
  if (!props.busy) emit('close');
}
</script>
<template>
    <dialog ref="dialog" class="modal-screen ui-overlay fixed inset-0 w-full h-full max-w-none max-h-none m-0 border-0 pt-[100px] px-0 pb-0 overflow-auto text-[var(--ui-text)] open:block backdrop:bg-transparent"
      @cancel="close" @click="event => { if (event.target === dialog) close(); }" :aria-label="title">
      <section class="modal relative m-auto p-0 border-0 w-[min(300px,calc(100vw-32px))] max-h-none overflow-visible ui-glass [&.wide]:w-[min(800px,calc(100vw-32px))] [&.bookmark-dialog]:w-[min(420px,calc(100vw-32px))]" :class="{ wide, 'bookmark-dialog': bookmark }">
      <PanelHeader :title="title" close-label="Закрыть" :busy="busy" @close="close()" />
      <div class="p-4"><slot /></div>
      </section>
    </dialog>
</template>
