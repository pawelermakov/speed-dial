<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import type { Bookmark, Folder } from '../types/models';
const props = defineProps<{ x: number; y: number; bookmark?: Bookmark; folder?: Folder }>();
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
    <div ref="menu" tabindex="-1" role="menu" :aria-label="folder ? 'Действия с папкой' : bookmark ? 'Действия с закладкой' : 'Действия со страницей'" class="context ui-glass fixed w-max min-w-[160px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto"
      :style="{ left: left + 'px', top: top + 'px' }" @keydown="keys" @pointermove="keyboardIndex = -1">
      <template v-if="folder">
        <button :class="{ 'keyboard-active': keyboardIndex === 0 }" role="menuitem" @click="emit('action', 'edit')">Изменить папку</button>
        <hr class="context-divider" role="separator" />
        <button :class="{ 'keyboard-active': keyboardIndex === 1 }" class="destructive" role="menuitem" @click="emit('action', 'delete')">Удалить папку</button>
      </template>
      <template v-else-if="bookmark">
        <button :class="{ 'keyboard-active': keyboardIndex === 0 }" role="menuitem" @click="emit('action', 'open')">Открыть в новой вкладке</button><hr class="context-divider" role="separator" />
        <button :class="{ 'keyboard-active': keyboardIndex === 1 }" role="menuitem" @click="emit('action', 'edit')">Изменить закладку</button>
        <button :class="{ 'keyboard-active': keyboardIndex === 2 }" role="menuitem" @click="emit('action', 'thumbnail')">Обновить эскиз</button>
        <hr class="context-divider" role="separator" />
        <button :class="{ 'keyboard-active': keyboardIndex === 3 }" class="destructive" role="menuitem" @click="emit('action', 'delete')">Удалить закладку</button>
      </template>
      <template v-else>
        <button :class="{ 'keyboard-active': keyboardIndex === 0 }" role="menuitem" @click="emit('action', 'add')">Новая закладка</button>
        <button :class="{ 'keyboard-active': keyboardIndex === 1 }" role="menuitem" @click="emit('action', 'folder')">Новая папка</button>
        <hr class="context-divider" role="separator" />
        <button :class="{ 'keyboard-active': keyboardIndex === 2 }" role="menuitem" @click="emit('action', 'settings')">Настройки</button>
      </template>
    </div>
  </div>
</template>
