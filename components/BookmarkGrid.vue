<script setup lang="ts">
import { ui } from '../utils/ui';
import { watch, onUnmounted, ref } from 'vue';
import type { Bookmark, Settings } from '../types/models';
const props = defineProps<{ tabs: Bookmark[]; settings: Settings; disabled: boolean }>();
const emit = defineEmits<{ add: []; context: [event: MouseEvent, bookmark: Bookmark]; reorder: [ids: number[]] }>();
const previews = ref<Record<number, string>>({});
const dragId = ref<number | null>(null);
const overId = ref<number | null>(null);
const release = () => { Object.values(previews.value).forEach(url => URL.revokeObjectURL(url)); };
watch(() => props.tabs, tabs => {
  release();
  previews.value = Object.fromEntries(tabs.filter(tab => tab.thumbnail).map(tab => [tab.id, URL.createObjectURL(tab.thumbnail!)]));
}, { immediate: true });
onUnmounted(release);
const initial = (url: string) => new URL(url).hostname.slice(0, 1).toUpperCase();
function start(event: DragEvent, id: number) {
  if (props.disabled) { event.preventDefault(); return; }
  dragId.value = id;
  event.dataTransfer?.setData('text/plain', String(id));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}
function finish() { dragId.value = null; overId.value = null; }
function drop(target?: number) {
  const ids = props.tabs.map(tab => tab.id);
  const from = ids.indexOf(dragId.value!);
  if (from < 0 || props.disabled) { finish(); return; }
  const to = target === undefined ? ids.length - 1 : ids.indexOf(target);
  if (to < 0) { finish(); return; }
  const [id] = ids.splice(from, 1);
  ids.splice(to, 0, id!);
  finish();
  emit('reorder', ids);
}
</script>
<template>
  <section aria-label="Визуальные закладки" class="grid bookmarks grid-cols-[repeat(var(--columns),minmax(0,1fr))] mx-auto" :style="{
      '--columns': settings.countColumns, '--gap': settings.space + 'px', width: settings.width + '%', gap: settings.space + 'px'
    }" @dragover.prevent @drop.self.prevent="drop()">
    <a v-for="tab in tabs" :key="tab.id" class="bookmark relative overflow-hidden group block min-w-0 pt-[56.25%] h-auto rounded-[5px] bg-white/80 bg-center bg-cover bg-no-repeat text-black shadow-[0_1px_3px_rgb(50_50_50/0.3)] hover:shadow-[0_0_15px_rgb(50_50_50/0.5)] [&.dragging]:opacity-40 [&.drop-target]:outline-3 [&.drop-target]:outline-[#ffcc00] transition-all duration-250 ease-in-out motion-reduce:transition-none"
      :class="{ dragging: dragId === tab.id, 'drop-target': overId === tab.id }"
      :href="tab.url" :title="tab.title + ' — ' + tab.url" :draggable="!disabled"
      :style="{ backgroundImage: previews[tab.id] ? 'url(' + previews[tab.id] + ')' : undefined }"
      @contextmenu.stop.prevent="emit('context', $event, tab)"
      @dragstart="start($event, tab.id)" @dragend="finish" @dragenter.prevent="overId = tab.id"
      @drop.stop.prevent="drop(tab.id)">
      <span v-if="!previews[tab.id]" class="placeholder sr-only absolute inset-0 grid place-items-center text-[32px] text-[#808590]" aria-hidden="true">{{ initial(tab.url) }}</span>
      <span class="bookmark-title flex items-center gap-2 absolute bottom-[5px] w-full border-y border-black/20 bg-white/80 backdrop-blur-[10px] p-[5px] text-base leading-[normal] transition-transform duration-250 ease-in-out group-hover:translate-y-[calc(100%+5px)] group-focus-visible:translate-y-0 [&_img]:w-4 [&_img]:min-w-4 [&_img]:h-4 [&_img]:object-cover">
        <img v-if="tab.favicon" :src="tab.favicon" width="16" height="16" alt="" class="shrink-0" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
        <span v-else class="bookmark-icon shrink-0 w-4 min-w-4 h-4" aria-hidden="true"></span>
        <span class="truncate">{{ tab.title }}</span>
      </span>
    </a>
    <button v-if="settings.addButton && dragId === null" class="add-card block min-w-0 pt-[56.25%] h-auto rounded-[5px] border border-black/20 bg-black/10 bg-[url(/images/newtab.png)] bg-center bg-no-repeat bg-size-[auto] shadow-[inset_0_0_3px_rgb(50_50_50/0.5)] hover:bg-black/30 transition-all duration-250 ease-in-out motion-reduce:transition-none" aria-label="Новая закладка" :disabled="disabled" @click="emit('add')" />
  </section>
  <div v-if="!tabs.length" class="empty-state sr-only focus-within:not-sr-only text-center mt-8 text-white">
    <p class="mb-3">Здесь появятся ваши любимые сайты.</p>
    <button class="button" :class="ui.button" :disabled="disabled" @click="emit('add')">Новая закладка</button>
  </div>
</template>
