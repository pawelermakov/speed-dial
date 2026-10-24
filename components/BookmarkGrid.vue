<script setup lang="ts">
import { watch, nextTick, onMounted, onUnmounted, ref, computed } from 'vue';
import { BookmarkImages } from '../utils/bookmarkImages';
import type { Bookmark, Settings } from '../types/models';
import TileHostname from './TileHostname.vue';
import EmptyState from './EmptyState.vue';
import { contextKey, gridFocusIndex, plainNavigation } from '../utils/keyboard';
import { insertedOrder, nearestInsertion } from '../utils/reorder';
import { tileHostname, tileColor, fitTileColumns } from '../utils/tile';
const props = defineProps<{ contextId?: string; revision?: number; motionEnabled: boolean; folderId?: string | null; tabs: Bookmark[]; settings: Settings; disabled: boolean; searching?: boolean; folderNames?: Record<string,string> }>();
const emit = defineEmits<{ add: []; context: [event: MouseEvent | KeyboardEvent, bookmark: Bookmark]; reorder: [ids: string[], expected: string[], revision: number]; refresh: [] }>();
const previews = ref<Record<string, string>>({});
const icons = ref<Record<string, string>>({});
const failedIcons = ref<Record<string, string>>({});
const dragId = ref<string | null>(null);
const overId = ref<string | null>(null);
const after = ref(false);
let expected: string[] = [], suppressClick = false, dragRevision = 0;
let clickResetTimer:ReturnType<typeof setTimeout>|undefined;
const grid = ref<HTMLElement>();
const gridWidth = ref(0);
const preparing = ref(true);
let generation = 0, disposed = false;
let revealPending = true;
let revealAnimations: Animation[] = [];
function cancelReveal() { for (const animation of revealAnimations) animation.cancel(); revealAnimations = []; }
watch(() => props.motionEnabled, enabled => { if (!enabled) cancelReveal(); });
const columns = computed(() => fitTileColumns(gridWidth.value, props.settings.countColumns, props.settings.space));
const images = new BookmarkImages((nextPreviews, nextIcons) => {
  previews.value = nextPreviews;
  icons.value = nextIcons;
});
watch([() => props.tabs, () => props.folderId], async ([tabs,folderId], previous) => {
  if (previous[0] && folderId !== previous[1]) {
    revealPending = true;
    cancelReveal();
  }
  const identity=(rows:Bookmark[])=>JSON.stringify(rows.map(tab=>[tab.id,tab.parentId,tab.title,tab.url]));
  if (dragId.value && previous[0] && identity(tabs)!==identity(previous[0])) end();
  const liveIds=new Set(tabs.map(tab=>tab.id));
  for(const id of Object.keys(failedIcons.value))if(!liveIds.has(id))delete failedIcons.value[id];
  const current = ++generation;
  const ready = images.sync(tabs);
  preparing.value = images.pending;
  await ready;
  if (disposed || current !== generation) return;
  preparing.value = false;
  await nextTick();
  if (disposed || current !== generation || !revealPending || !grid.value) return;
  // Settle the responsive columns before rasterizing each tile at its final size.
  gridWidth.value = grid.value.getBoundingClientRect().width;
  await nextTick();
  if (disposed || current !== generation || !grid.value) return;
  revealPending = false;
  if (props.motionEnabled) {
    const style = getComputedStyle(grid.value);
    const duration = style.getPropertyValue('--motion-fast').trim();
    const options = {
      id:'bookmark-reveal', duration:parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000), easing:style.getPropertyValue('--ease-enter').trim(),
    };
    // Do not flatten the whole grid into a temporary bitmap during the fade.
    revealAnimations = Array.from(grid.value.querySelectorAll<HTMLElement>('.bookmark,.add-card'))
      .filter(tile => { const box = tile.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth; })
      .map(tile => tile.animate([{opacity:0},{opacity:1}], options));
  }
}, { immediate: true });
let observer: ResizeObserver | undefined;
let resizeFrame = 0;
onMounted(() => {
  gridWidth.value = grid.value!.getBoundingClientRect().width;
  observer = new ResizeObserver(entries => {
    const width = entries[0]!.contentRect.width;
    cancelAnimationFrame(resizeFrame);
    // Updating columns changes grid height. Defer beyond this observer delivery
    // to avoid a second layout notification in the same frame.
    resizeFrame = requestAnimationFrame(() => { gridWidth.value = width; });
  });
  observer.observe(grid.value!);
});
onUnmounted(() => { disposed = true; generation++; cancelReveal(); clearTimeout(clickResetTimer); cancelAnimationFrame(resizeFrame); observer?.disconnect(); images.dispose(); });
function start(event: DragEvent, id: string) {
  if (props.disabled || props.searching) { event.preventDefault(); return; }
  cancelReveal();
  clearTimeout(clickResetTimer);dragId.value = id; dragRevision = props.revision ?? 0; expected = props.tabs.map(row => row.id); suppressClick = true;
  event.dataTransfer?.setData('text/plain', String(id));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}
function finish() { dragId.value = null; overId.value = null; }
function end() { const cancelled = !!dragId.value; finish(); if (cancelled) emit('refresh'); clearTimeout(clickResetTimer);clickResetTimer=setTimeout(() => { suppressClick = false; }, 100); }
watch(() => [props.disabled, props.searching, props.revision], () => { if (dragId.value) end(); });
function over(event: DragEvent, id: string) {
  if (!dragId.value || props.disabled || props.searching) return;
  event.preventDefault();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  after.value = event.clientX > rect.left + rect.width / 2;
  overId.value = insertedOrder(expected,dragId.value,id,after.value) ? id : null;
}
function drop(event: DragEvent, target: string) {
  if (!dragId.value || props.disabled || props.searching) { finish(); return; }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const ids = insertedOrder(expected, dragId.value, target, event.clientX > rect.left + rect.width / 2);
  finish(); if (ids && dragRevision === (props.revision ?? 0)) emit('reorder', ids, expected, dragRevision);
}
function gridTarget(event:DragEvent){
  return nearestInsertion(Array.from(grid.value?.querySelectorAll<HTMLElement>('.bookmark')??[]).map(el=>({id:el.dataset.bookmarkId!,...el.getBoundingClientRect().toJSON()})),event.clientX,event.clientY);
}
function overGrid(event:DragEvent){
  if(!dragId.value||props.disabled||props.searching||(event.target as Element).closest('.bookmark'))return;
  event.preventDefault();const target=gridTarget(event);overId.value=target&&insertedOrder(expected,dragId.value,target.id,target.after)?target.id:null;if(target)after.value=target.after;
}
function dropGrid(event:DragEvent){
  if(!dragId.value||props.disabled||props.searching)return;
  const target=gridTarget(event),ids=target&&insertedOrder(expected,dragId.value,target.id,target.after);
  finish();if(ids&&dragRevision===(props.revision??0))emit('reorder',ids,expected,dragRevision);
}
function click(event: MouseEvent) { if (suppressClick) { event.preventDefault(); suppressClick = false; } }
function key(event: KeyboardEvent, tab: Bookmark) {
  if (props.disabled) return;
  if (contextKey(event)) { event.preventDefault(); event.stopPropagation(); emit('context', event, tab); return; }
  if (!plainNavigation(event) || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const next = gridFocusIndex(props.tabs.findIndex(row => row.id === tab.id), props.tabs.length, columns.value, event.key);
  grid.value?.querySelectorAll<HTMLElement>('.bookmark')[next]?.focus();
}
</script>
<template>
  <section ref="grid" aria-label="Визуальные закладки" :aria-busy="preparing" class="grid bookmarks grid-cols-[repeat(var(--columns),minmax(0,1fr))] mx-auto" :style="{
      '--columns': columns, '--gap': settings.space + 'px', width: settings.width + '%', gap: settings.space + 'px', visibility: preparing && revealPending && !dragId ? 'hidden' : undefined
    }" @dragover="overGrid" @drop.prevent="dropGrid">
    <a v-for="tab in tabs" :key="tab.id" class="bookmark select-none relative overflow-hidden group block min-w-0 bg-center bg-cover bg-no-repeat text-black [&.dragging]:opacity-40 [&.drop-target]:outline-3 [&.drop-target]:outline-[var(--ui-accent)]"
      :class="{ dragging: dragId === tab.id, 'drop-target': overId === tab.id, 'insert-after': overId === tab.id && after, 'insert-before': overId === tab.id && !after }"
      :data-bookmark-id="tab.id" aria-haspopup="menu" :aria-expanded="contextId === tab.id" :aria-controls="contextId === tab.id ? 'bookmark-context-menu' : undefined" :href="tab.url" :title="tab.title + ' — ' + tab.url + (searching && folderNames?.[tab.parentId] ? ' · ' + folderNames[tab.parentId] : '')" :aria-label="tab.title + ' — ' + tab.url + (searching && folderNames?.[tab.parentId] ? ' · ' + folderNames[tab.parentId] : '')" :draggable="!disabled && !searching"
      :style="{ backgroundImage: previews[tab.id] ? 'url(' + previews[tab.id] + ')' : undefined, backgroundColor: previews[tab.id] ? undefined : tab.faviconColor ?? tileColor(tileHostname(tab.url)) }"
      @keydown="key($event, tab)" @contextmenu.stop.prevent="emit('context', $event, tab)"
      @dragstart="start($event, tab.id)" @dragend="end" @dragover="over($event, tab.id)" @click="click"
      @drop.stop.prevent="drop($event, tab.id)">
      <TileHostname v-if="!previews[tab.id]" :hostname="tileHostname(tab.url)" />
      <span v-else class="bookmark-title flex items-center gap-2 absolute bottom-0 inset-x-0 ui-caption px-2 py-1 text-base [&_img]:w-4 [&_img]:min-w-4 [&_img]:h-4 [&_img]:object-contain">
        <img v-if="icons[tab.id] && failedIcons[tab.id] !== icons[tab.id]" :src="icons[tab.id]" width="16" height="16" alt="" draggable="false" class="shrink-0 pointer-events-none" @error="failedIcons[tab.id] = icons[tab.id]!" />
        <svg v-else class="bookmark-icon pointer-events-none shrink-0 size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z"/></svg>
        <span class="bookmark-title-label min-w-0 flex-1 truncate">{{ tab.title }}</span>
      </span>
    </a>
    <div v-if="!searching && !tabs.length" class="bookmark-empty col-span-full">
      <EmptyState title="В этой папке пока нет закладок" description="Добавьте любимый сайт, чтобы открывать его из новой вкладки." action-label="Новая закладка" symbol="bookmark" :disabled="disabled" @action="emit('add')" />
    </div>
    <button v-if="!searching && tabs.length && settings.addButton" :inert="dragId !== null" :style="{visibility:dragId !== null?'hidden':undefined}" class="add-card relative block min-w-0" aria-label="Новая закладка" :disabled="disabled || dragId !== null" @click="emit('add')"><svg class="absolute left-1/2 top-1/2 w-[40%] max-w-14 h-auto max-h-[60%] -translate-x-1/2 -translate-y-1/2" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6v28M6 20h28"/></svg></button>
  </section>
</template>
<style scoped>
.bookmark.insert-before::after,.bookmark.insert-after::after{content:'';position:absolute;inset-block:0;width:4px;background:var(--ui-accent);box-shadow:0 0 0 1px var(--ui-accent-contrast);}
.bookmark.insert-before::after{left:0;}.bookmark.insert-after::after{right:0;}
</style>
