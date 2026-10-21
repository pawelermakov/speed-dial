<script setup lang="ts">
import { watch, onMounted, onUnmounted, ref, computed } from 'vue';
import { BookmarkImages } from '../utils/bookmarkImages';
import type { Bookmark, Settings } from '../types/models';
import TileHostname from './TileHostname.vue';
import { insertedOrder } from '../utils/reorder';
import { tileHostname, tileColor, fitTileColumns } from '../utils/tile';
const props = defineProps<{ revision?: number; tabs: Bookmark[]; settings: Settings; disabled: boolean; searching?: boolean; categoryNames?: Record<string,string> }>();
const emit = defineEmits<{ add: []; context: [event: MouseEvent, bookmark: Bookmark]; reorder: [ids: string[], expected: string[], revision: number]; refresh: [] }>();
const previews = ref<Record<string, string>>({});
const icons = ref<Record<string, string>>({});
const dragId = ref<string | null>(null);
const overId = ref<string | null>(null);
const after = ref(false);
let expected: string[] = [], suppressClick = false, dragRevision = 0;
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
  if (dragId.value) { finish(); emit('refresh'); }
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
  if (props.disabled || props.searching) { event.preventDefault(); return; }
  dragId.value = id; dragRevision = props.revision ?? 0; expected = props.tabs.map(row => row.id); suppressClick = true;
  event.dataTransfer?.setData('text/plain', String(id));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}
function finish() { dragId.value = null; overId.value = null; }
function end() { const cancelled = !!dragId.value; finish(); if (cancelled) emit('refresh'); setTimeout(() => { suppressClick = false; }, 100); }
watch(() => [props.disabled, props.searching, props.revision], () => { if (dragId.value) end(); });
function over(event: DragEvent, id: string) {
  if (!dragId.value || dragId.value === id || props.disabled || props.searching) return;
  event.preventDefault(); overId.value = id;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  after.value = event.clientX > rect.left + rect.width / 2;
}
function drop(event: DragEvent, target: string) {
  if (!dragId.value || props.disabled || props.searching) { finish(); return; }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const ids = insertedOrder(expected, dragId.value, target, event.clientX > rect.left + rect.width / 2);
  finish(); if (ids && dragRevision === (props.revision ?? 0)) emit('reorder', ids, expected, dragRevision);
}
function click(event: MouseEvent) { if (suppressClick) { event.preventDefault(); suppressClick = false; } }
</script>
<template>
  <section ref="grid" aria-label="Визуальные закладки" :aria-busy="preparing" class="grid bookmarks grid-cols-[repeat(var(--columns),minmax(0,1fr))] mx-auto" :style="{
      '--columns': columns, '--gap': settings.space + 'px', width: settings.width + '%', gap: settings.space + 'px', visibility: preparing ? 'hidden' : undefined
    }" >
    <a v-for="tab in tabs" :key="tab.id" class="bookmark relative overflow-hidden group block min-w-0 pt-[56.25%] h-auto rounded-[var(--ui-radius)] bg-center bg-cover bg-no-repeat text-black shadow-[var(--ui-shadow-tile)] hover:shadow-[var(--ui-shadow-raised)] [&.dragging]:opacity-40 [&.drop-target]:outline-3 [&.drop-target]:outline-[var(--ui-accent)] transition-all duration-250 ease-in-out motion-reduce:transition-none"
      :class="{ dragging: dragId === tab.id, 'drop-target': overId === tab.id, 'insert-after': overId === tab.id && after, 'insert-before': overId === tab.id && !after }"
      :href="tab.url" :title="tab.title + ' — ' + tab.url + (searching && categoryNames?.[tab.parentId] ? ' · ' + categoryNames[tab.parentId] : '')" :aria-label="tab.title + ' — ' + tab.url + (searching && categoryNames?.[tab.parentId] ? ' · ' + categoryNames[tab.parentId] : '')" :draggable="!disabled && !searching"
      :style="{ backgroundImage: previews[tab.id] ? 'url(' + previews[tab.id] + ')' : undefined, backgroundColor: previews[tab.id] ? undefined : tab.faviconColor ?? tileColor(tileHostname(tab.url)) }"
      @contextmenu.stop.prevent="emit('context', $event, tab)"
      @dragstart="start($event, tab.id)" @dragend="end" @dragover="over($event, tab.id)" @click="click"
      @drop.stop.prevent="drop($event, tab.id)">
      <TileHostname v-if="!previews[tab.id]" :hostname="tileHostname(tab.url)" />
      <span v-else class="bookmark-title flex items-center gap-2 absolute bottom-1 w-full border-y border-black/20 ui-caption p-1 text-base leading-[normal] transition-transform duration-250 ease-in-out group-hover:translate-y-[calc(100%+4px)] group-focus-visible:translate-y-0 [&_img]:w-4 [&_img]:min-w-4 [&_img]:h-4 [&_img]:object-cover">
        <img v-if="icons[tab.id]" :src="icons[tab.id]" width="16" height="16" alt="" class="shrink-0" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
        <span v-else class="bookmark-icon shrink-0 w-4 min-w-4 h-4" aria-hidden="true"></span>
        <span class="truncate">{{ tab.title }}</span>
      </span>
    </a>
    <button v-if="!searching && (!tabs.length || settings.addButton) && dragId === null" class="add-card ui-glass relative block min-w-0 pt-[56.25%] h-auto rounded-[var(--ui-radius)] ui-hover transition-all duration-250 ease-in-out motion-reduce:transition-none" aria-label="Новая закладка" :disabled="disabled" @click="emit('add')"><svg class="absolute left-1/2 top-1/2 w-[40%] max-w-14 h-auto max-h-[60%] -translate-x-1/2 -translate-y-1/2" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6v28M6 20h28"/></svg></button>
  </section>
</template>
<style scoped>
.bookmark.insert-before::after,.bookmark.insert-after::after{content:'';position:absolute;inset-block:0;width:4px;background:var(--ui-accent);box-shadow:0 0 0 1px var(--ui-accent-contrast);}
.bookmark.insert-before::after{left:0;}.bookmark.insert-after::after{right:0;}
</style>
