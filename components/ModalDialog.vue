<script setup lang="ts">
import { onMounted, ref } from 'vue';
import PanelHeader from './PanelHeader.vue';
const props = defineProps<{ title: string; busy?: boolean; wide?: boolean; bookmark?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
onMounted(() => { dialog.value?.showModal(); });
function close(event?: Event) {
  event?.preventDefault();
  if (!props.busy) emit('close');
}
</script>
<template>
    <dialog ref="dialog" class="modal-screen ui-overlay fixed inset-0 w-full h-full max-w-none max-h-none m-0 border-0 p-4 overflow-auto text-[var(--ui-text)] backdrop:bg-transparent"
      @cancel="close" @click="event => { if (event.target === dialog) close(); }" :aria-label="title">
      <section class="modal relative m-auto p-0 border-0 max-h-[calc(100dvh-32px)] overflow-y-auto ui-glass" :class="{ wide, 'bookmark-dialog': bookmark }">
      <PanelHeader :title="title" close-label="Закрыть" :busy="busy" @close="close()" />
      <div class="p-5"><slot /></div>
      </section>
    </dialog>
</template>
