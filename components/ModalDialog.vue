<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
const props = defineProps<{ title: string; busy?: boolean; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
let previous: Element | null = null;
onMounted(() => { previous = document.activeElement; dialog.value?.showModal(); });
onUnmounted(() => { if (previous instanceof HTMLElement) previous.focus(); });
function close(event?: Event) {
  event?.preventDefault();
  if (!props.busy) emit('close');
}
</script>
<template>
    <dialog ref="dialog" class="modal-screen fixed inset-0 w-full h-full max-w-none max-h-none m-0 border-0 pt-[100px] px-0 pb-0 overflow-auto bg-black/40 backdrop-blur-[10px] text-[#212529] open:block backdrop:bg-transparent"
      @cancel="close" @click="event => { if (event.target === dialog) close(); }" :aria-label="title">
      <section class="modal relative m-auto p-0 border-0 w-[min(300px,calc(100vw-32px))] max-h-none overflow-visible bg-white/80 backdrop-blur-[10px] rounded-[5px] shadow-[0_1px_3px_rgb(50_50_50/0.3)] [&.wide]:w-[min(800px,calc(100vw-32px))] [&_h2]:text-base [&_h2]:font-normal [&_h2]:leading-[normal] [&_h2]:text-[#212529]" :class="{ wide }">
      <header class="flex items-center justify-between border-b border-black/20 p-4">
        <h2>{{ title }}</h2>
        <button class="close w-6 h-6 p-0 bg-transparent border-0 text-black/20 text-[1.75rem] font-bold leading-6 hover:text-black/50 transition-all duration-250 ease-in-out motion-reduce:transition-none" type="button" aria-label="Закрыть" :disabled="busy" @click="close()">×</button>
      </header>
      <div class="p-4"><slot /></div>
      </section>
    </dialog>
</template>
