<script setup lang="ts">
import { ui } from '../utils/ui';
import { watch, ref, onUnmounted } from 'vue';
import { suggestions } from '../services/network';
const query = ref('');
const inputValue = ref('');
const items = ref<string[]>([]);
const selected = ref(-1);
const focused = ref(false);
const error = ref('');
let timer: ReturnType<typeof setTimeout>;
let request: AbortController | undefined;
let generation = 0;
watch(query, value => {
  clearTimeout(timer); request?.abort(); generation++;
  items.value = []; selected.value = -1; error.value = '';
  if (!value.trim()) return;
  const token = generation;
  timer = setTimeout(async () => {
    const controller = new AbortController(); request = controller;
    try {
      const result = await suggestions(value, controller.signal);
      if (token === generation) items.value = result;
    } catch (cause) {
      if (token === generation && !controller.signal.aborted) error.value = 'Подсказки недоступны. Поиск продолжает работать.';
    }
  }, 250);
});
onUnmounted(() => { clearTimeout(timer); request?.abort(); });
function submit(value?: string) {
  const text = (value ?? (selected.value >= 0 ? items.value[selected.value] : inputValue.value))?.trim();
  if (text) window.location.assign('https://www.yandex.ru/yandsearch?' + new URLSearchParams({ text }));
}
function key(event: KeyboardEvent) {
  if (event.key === 'Escape') { focused.value = false; return; }
  if (event.key === 'Enter') { event.preventDefault(); submit(); return; }
  if (items.value.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    selected.value = selected.value < 0
      ? event.key === 'ArrowDown' ? 0 : items.value.length - 1
      : (selected.value + (event.key === 'ArrowDown' ? 1 : -1) + items.value.length) % items.value.length;
    inputValue.value = items.value[selected.value] ?? inputValue.value;
  }
}
</script>
<template>
  <form class="search flex relative mx-auto mb-6 w-full max-w-[700px] h-10 items-center [&_input]:h-10 [&_input]:leading-10 [&_input]:px-4 [&_input]:py-0 [&_input]:border-2 [&_input]:border-[#ffcc00] [&_input]:rounded-l-[5px] [&_input]:rounded-r-none [&_input]:text-black [&_button]:w-[85px] [&_button]:h-10 [&_button]:p-0 [&_button]:border-0 [&_button]:shrink-0 [&_button]:rounded-l-none [&_button]:rounded-r-[5px] [&_button]:text-black [&_button:disabled]:text-[rgb(16_16_16/0.3)]" @submit.prevent="submit()">
    <input v-model="inputValue" @input="query = inputValue" class="min-w-0 flex-1 bg-white px-4" name="text" placeholder="Поиск в Яндекс..."
      aria-label="Поиск в Яндексе" autocomplete="off" role="combobox" :aria-expanded="focused && items.length > 0"
      aria-controls="suggestions" :aria-activedescendant="selected >= 0 ? 'suggestion-' + selected : undefined"
      @focus="focused = true" @blur="focused = false" @keydown="key" />
    <button class="button" :class="ui.button" :disabled="!inputValue.trim()">Найти</button>
    <ul v-if="focused && items.length" id="suggestions" class="suggestions absolute w-full text-base top-[43px] z-5 bg-white/80 backdrop-blur-[10px] rounded-[5px] shadow-[0_1px_3px_rgb(50_50_50/0.3)] overflow-hidden text-black [&_li]:h-[35px] [&_li]:leading-[35px] [&_li]:py-0 [&_li]:px-4 [&_li]:transition-all [&_li]:duration-250 [&_li]:ease-in-out [&_.selected]:bg-[#ffeba0]" role="listbox">
      <li v-for="(item, index) in items" :id="'suggestion-' + index" :key="index" role="option" :aria-selected="index === selected"
        class="truncate px-4 py-2 cursor-pointer" :class="{ selected: index === selected }"
        @mouseenter="selected = index" @mouseleave="selected = -1" @mousedown.prevent="submit(item)">{{ item }}</li>
    </ul>
    <span v-if="error && focused" role="status" class="absolute top-full text-xs text-white mt-1">{{ error }}</span>
  </form>
</template>
