<script setup lang="ts">
import { t } from '../services/i18n';
import { onMounted, ref } from 'vue';
import PanelHeader from './PanelHeader.vue';
import { cycleDialogFocus } from '../utils/keyboard';
const props = defineProps<{ title: string; busy?: boolean; wide?: boolean; bookmark?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
onMounted(() => {
  dialog.value?.showModal();
});
function close(event?: Event) {
  event?.preventDefault();
  if (event instanceof KeyboardEvent && event.isComposing) return;
  if (!props.busy) emit('close');
}
</script>
<template>
  <dialog
    ref="dialog"
    class="modal-screen ui-overlay fixed inset-0 w-full h-full max-w-none max-h-none m-0 border-0 p-4 overflow-auto text-[var(--ui-text)] backdrop:bg-transparent"
    @keydown.tab="cycleDialogFocus($event, dialog)"
    @keydown.esc.prevent.stop="close"
    @cancel="close"
    @click="
      (event) => {
        if (event.target === dialog) close();
      }
    "
    :aria-label="title"
  >
    <section
      class="modal relative m-auto p-0 border-0 max-h-[calc(100dvh-32px)] overflow-y-auto ui-glass"
      :class="{ wide, 'bookmark-dialog': bookmark }"
    >
      <PanelHeader :title="title" :close-label="t('common.close')" :busy="busy" @close="close()" />
      <div class="p-5"><slot /></div>
    </section>
  </dialog>
</template>
