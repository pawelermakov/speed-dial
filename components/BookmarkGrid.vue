<script setup lang="ts">
import { watch, onMounted, onUnmounted, ref, computed } from 'vue';
import { BookmarkImages } from '../utils/bookmarkImages';
import type { Bookmark, Settings } from '../types/models';
import TileHostname from './TileHostname.vue';
import { tileHostname, tileColor, fitTileColumns } from '../utils/tile';
const props = defineProps<{ tabs: Bookmark[]; settings: Settings; disabled: boolean }>();
const emit = defineEmits<{ add: []; context: [event: MouseEvent, bookmark: Bookmark]; reorder: [ids: string[]] }>();
const previews = ref<Record<string, string>>({});
const icons = ref<Record<string, string>>({});
const dragId = ref<string | null>(null);
const overId = ref<string | null>(null);
const grid = ref<HTMLElement>();
const gridWidth = ref(0);
const preparing = ref(true);
let generation = 0, disposed = false;
const columns = computed(() => fitTileColumns(gridWidth.value, props.settings.countColumns, props.settings.space));
const images = new BookmarkImages((nextPreviews, nextIcons) => {
  previews.value = nextPreviews;
  icons.value = nextIcons;
});
watch(() => props.tabs, async tabs => {
  const current = ++generation;
  const ready = images.sync(tabs);
  preparing.value = images.pending;
  await ready;
  if (!disposed && current === generation) preparing.value = false;
}, { immediate: true });
let observer: ResizeObserver | undefined;
onMounted(() => {
  gridWidth.value = grid.value!.clientWidth;
  observer = new ResizeObserver(entries => { gridWidth.value = entries[0]!.contentRect.width; });
  observer.observe(grid.value!);
});
onUnmounted(() => { disposed = true; generation++; observer?.disconnect(); images.dispose(); });
function start(event: DragEvent, id: string) {
  if (props.disabled) { event.preventDefault(); return; }
  dragId.value = id;
  event.dataTransfer?.setData('text/plain', String(id));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}
function finish() { dragId.value = null; overId.value = null; }
function drop(target?: string) {
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
  <section ref="grid" aria-label="Визуальные закладки" :aria-busy="preparing" class="grid bookmarks grid-cols-[repeat(var(--columns),minmax(0,1fr))] mx-auto" :style="{
      '--columns': columns, '--gap': settings.space + 'px', width: settings.width + '%', gap: settings.space + 'px', visibility: preparing ? 'hidden' : undefined
    }" @dragover.prevent @drop.self.prevent="drop()">
    <a v-for="tab in tabs" :key="tab.id" class="bookmark relative overflow-hidden group block min-w-0 pt-[56.25%] h-auto rounded-[5px] bg-white/80 bg-center bg-cover bg-no-repeat text-black shadow-[0_1px_3px_rgb(50_50_50/0.3)] hover:shadow-[0_0_15px_rgb(50_50_50/0.5)] [&.dragging]:opacity-40 [&.drop-target]:outline-3 [&.drop-target]:outline-[#ffcc00] transition-all duration-250 ease-in-out motion-reduce:transition-none"
      :class="{ dragging: dragId === tab.id, 'drop-target': overId === tab.id }"
      :href="tab.url" :title="tab.title + ' — ' + tab.url" :aria-label="tab.title + ' — ' + tab.url" :draggable="!disabled"
      :style="{ backgroundImage: previews[tab.id] ? 'url(' + previews[tab.id] + ')' : undefined, backgroundColor: previews[tab.id] ? undefined : tab.faviconColor ?? tileColor(tileHostname(tab.url)) }"
      @contextmenu.stop.prevent="emit('context', $event, tab)"
      @dragstart="start($event, tab.id)" @dragend="finish" @dragenter.prevent="overId = tab.id"
      @drop.stop.prevent="drop(tab.id)">
      <TileHostname v-if="!previews[tab.id]" :hostname="tileHostname(tab.url)" />
      <span v-else class="bookmark-title flex items-center gap-2 absolute bottom-[5px] w-full border-y border-black/20 bg-white/80 backdrop-blur-[10px] p-[5px] text-base leading-[normal] transition-transform duration-250 ease-in-out group-hover:translate-y-[calc(100%+5px)] group-focus-visible:translate-y-0 [&_img]:w-4 [&_img]:min-w-4 [&_img]:h-4 [&_img]:object-cover">
        <img v-if="icons[tab.id]" :src="icons[tab.id]" width="16" height="16" alt="" class="shrink-0" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
        <span v-else class="bookmark-icon shrink-0 w-4 min-w-4 h-4" aria-hidden="true"></span>
        <span class="truncate">{{ tab.title }}</span>
      </span>
    </a>
    <button v-if="(!tabs.length || settings.addButton) && dragId === null" class="add-card block min-w-0 pt-[56.25%] h-auto rounded-[5px] border border-black/20 bg-black/10 bg-[url(/images/newtab.png)] bg-center bg-no-repeat bg-size-[auto] shadow-[inset_0_0_3px_rgb(50_50_50/0.5)] hover:bg-black/30 transition-all duration-250 ease-in-out motion-reduce:transition-none" aria-label="Новая закладка" :disabled="disabled" @click="emit('add')" />
  </section>
</template>
