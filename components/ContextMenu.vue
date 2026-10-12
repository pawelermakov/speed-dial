<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import type { Bookmark } from '../types/models';
const props = defineProps<{ x: number; y: number; bookmark?: Bookmark }>();
const emit = defineEmits<{ close: []; action: [name: string] }>();
const menu = ref<HTMLElement>();
const keyboardIndex = ref(-1);
const left = ref(props.x);
const top = ref(props.y);
onMounted(async () => {
  await nextTick();
  const box = menu.value!.getBoundingClientRect();
  left.value = Math.max(4, Math.min(props.x, window.innerWidth - box.width - 4));
  top.value = Math.max(4, Math.min(props.y, window.innerHeight - box.height - 4));
  menu.value?.focus({ preventScroll: true });
  window.addEventListener('resize', close);
});
const close = () => emit('close');
onUnmounted(() => window.removeEventListener('resize', close));
function keys(event: KeyboardEvent) {
  if (event.key === 'Escape') { close(); return; }
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.preventDefault();
  const buttons = Array.from(menu.value!.querySelectorAll('button'));
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  keyboardIndex.value = index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1)
    : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[keyboardIndex.value]?.focus({ preventScroll: true });
}
</script>
<template>
  <div class="fixed inset-0 z-30" @pointerdown.self="close" @contextmenu.self.prevent="close">
    <div ref="menu" tabindex="-1" role="menu" aria-label="Действия" class="context fixed min-w-[160px] max-w-[calc(100vw-8px)] py-[5px] mt-[2px] text-base leading-[normal] bg-white/80 backdrop-blur-[10px] rounded-[5px] shadow-[0_1px_3px_rgb(50_50_50/0.3)] bg-clip-padding overflow-hidden animate-fade motion-reduce:animate-none focus:outline-none [&_button]:block [&_button]:w-full [&_button]:text-left [&_button]:py-[3px] [&_button]:px-5 [&_button]:text-base [&_button]:leading-[normal] [&_button]:whitespace-nowrap [&_button]:transition-all [&_button]:duration-250 [&_button]:ease-in-out [&_button:hover]:bg-[#ffeba0] [&_.keyboard-active]:bg-[#ffeba0] [&_button:focus]:outline-none"
      :style="{ left: left + 'px', top: top + 'px' }" @keydown="keys" @pointermove="keyboardIndex = -1">
      <template v-if="bookmark">
        <button :class="{ 'keyboard-active': keyboardIndex === 0 }" role="menuitem" @click="emit('action', 'open')">Открыть в новой вкладке</button><hr class="context-divider h-[2px] my-[9px] border border-solid border-t-[#9a9a9a] border-l-[#9a9a9a] border-r-[#eeeeee] border-b-[#eeeeee] bg-black/20 text-[#808080]" />
        <button :class="{ 'keyboard-active': keyboardIndex === 1 }" role="menuitem" @click="emit('action', 'edit')">Изменить</button>
        <button :class="{ 'keyboard-active': keyboardIndex === 2 }" role="menuitem" @click="emit('action', 'thumbnail')">Обновить эскиз</button>
        <button :class="{ 'keyboard-active': keyboardIndex === 3 }" role="menuitem" @click="emit('action', 'delete')">Удалить</button>
      </template>
      <template v-else>
        <button :class="{ 'keyboard-active': keyboardIndex === 0 }" role="menuitem" @click="emit('action', 'add')">Новая закладка</button><hr class="context-divider h-[2px] my-[9px] border border-solid border-t-[#9a9a9a] border-l-[#9a9a9a] border-r-[#eeeeee] border-b-[#eeeeee] bg-black/20 text-[#808080]" />
        <button :class="{ 'keyboard-active': keyboardIndex === 1 }" role="menuitem" @click="emit('action', 'settings')">Настройки</button>
        <button role="menuitem" @click="emit('action', 'category')">Новая категория</button>
      </template>
    </div>
  </div>
</template>
