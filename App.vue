<script setup lang="ts">
import { ref, shallowRef, computed, watch, nextTick, onUnmounted } from 'vue';
import { browser } from 'wxt/browser';
import FolderTabs from './components/FolderTabs.vue';
import FolderDialog from './components/FolderDialog.vue';
import { faviconBlob } from './services/favicons';
import BookmarkGrid from './components/BookmarkGrid.vue';
import { useBookmarkSearch } from './composables/useBookmarkSearch';
import BookmarkDialog from './components/BookmarkDialog.vue';
import SearchBar from './components/SearchBar.vue';
import EmptyState from './components/EmptyState.vue';
import MailIndicator from './components/MailIndicator.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import ContextMenu from './components/ContextMenu.vue';
import ImportExportDialog from './components/ImportExportDialog.vue';
import { useDial, repository } from './composables/useDial';
import { requestThumbnail } from './services/thumbnails';
import { parseImport, serializeExport } from './services/importExport';
import { normalizeUrl } from './services/validation';
import { cacheBackgroundPreview, clearBackgroundPreview } from './utils/backgroundPreview';
import { BackgroundResource } from './utils/backgroundResource';
import { insertedOrder } from './utils/reorder';
import { contextKey } from './utils/keyboard';
import type { Bookmark, Folder } from './types/models';

const { snapshot, loading, busy, notice, run, refresh, announce, revision, changeSearchProvider, updateSettings, changeRoot, changeBackground, flushSettings, settingErrors } = useDial();
const { query, results, pending: searchPending, error: searchError } = useBookmarkSearch(repository, snapshot, revision);
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion:reduce)');
const reducedMotion = ref(reducedMotionQuery.matches);
const motionEnabled = computed(() => !reducedMotion.value);
function motionPreferenceChanged(event:MediaQueryListEvent) { reducedMotion.value = event.matches; }
reducedMotionQuery.addEventListener('change',motionPreferenceChanged);
onUnmounted(() => reducedMotionQuery.removeEventListener('change',motionPreferenceChanged));
const keyboardFocus = ref(true);
function trackKeyboardFocus(event:KeyboardEvent){if(!event.isComposing && ['Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','F10','ContextMenu'].includes(event.key))keyboardFocus.value=true;}
function trackPointerFocus(){keyboardFocus.value=false;}
window.addEventListener('keydown',trackKeyboardFocus,true);
window.addEventListener('pointerdown',trackPointerFocus,true);
onUnmounted(()=>{window.removeEventListener('keydown',trackKeyboardFocus,true);window.removeEventListener('pointerdown',trackPointerFocus,true);});
const searchText = ref('');
const searchControl = ref<InstanceType<typeof SearchBar>>();
const bookmarkMode = computed(()=>snapshot.value.settings.bookmarkSearch && snapshot.value.settings.searchProvider==='bookmarks');
watch([searchText,bookmarkMode],()=>{query.value=bookmarkMode.value?searchText.value:'';},{flush:'sync'});
watch([()=>snapshot.value.settings.bookmarkSearch,bookmarkMode],([enabled],previous)=>{if(!enabled&&previous?.[1])searchText.value='';},{flush:'sync'});
const searching = computed(() => bookmarkMode.value && !!query.value.trim());
const showEmptySearch = ref(false);
let emptySearchTimer: ReturnType<typeof setTimeout> | undefined;
watch([query, bookmarkMode, searchPending, searchError, results], () => {
  clearTimeout(emptySearchTimer);
  showEmptySearch.value = false;
  if (searching.value && !searchPending.value && !searchError.value && !results.value.length)
    emptySearchTimer = setTimeout(() => { showEmptySearch.value = true; }, 400);
}, { flush: 'sync' });
onUnmounted(() => clearTimeout(emptySearchTimer));
function openSearch() { void searchControl.value?.openBookmarks(); }
function closeSearch() { searchText.value=''; }
function focusSearchResult() { document.querySelector<HTMLElement>('.bookmark')?.focus(); }
const capturing = ref(false);
const savingBookmark = ref(false);
const folderDialogError=ref('');
const creatingFolder = ref(false);
const editingFolder = shallowRef<{ id: string; title: string }>();

watch(() => snapshot.value.rootId, () => { creatingFolder.value = false; editingFolder.value = undefined; });
const disabled = computed(() => loading.value || busy.value || capturing.value || savingBookmark.value);
const settingsOpen = ref(false);
const settingsPanel = ref<InstanceType<typeof SettingsPanel>>();
let settingsGeneration=0;
async function closeSettings(){
  if(!settingsOpen.value)return;
  const generation=settingsGeneration;
  await settingsPanel.value?.flush();await flushSettings();
  if(generation===settingsGeneration)settingsOpen.value=false;
}
function openSettings() { settingsGeneration++;settingsOpen.value = true; }
const bookmarkDialog = ref(false);
const editing = shallowRef<Bookmark>();
const dialogError = ref('');
const folderError = ref('');
const dialogFolders = ref<Folder[]>([]);
async function openBookmark(bookmark?: Bookmark) {
  if (disabled.value) return;
  try {
    const root = await repository.rootNode();
    const choices = await repository.choices();
    const children = await repository.bookmarks.getChildren(root.id);
    dialogFolders.value = [{ id: root.id, title: root.title, index: -1 }, ...children.filter(row => !row.url && choices.some(choice => choice.id === row.id)).map(row => ({ id: row.id, title: row.title, index: row.index ?? 0 }))];
    editing.value = bookmark ? { ...bookmark, ...(await repository.bookmark(bookmark.id)) } as Bookmark : undefined;
    dialogError.value = ''; folderError.value = ''; bookmarkDialog.value = true;
  } catch (error) { notice.value = fail(error); }
}
const importError = ref('');
const mailRevision = ref(0);
watch(()=>snapshot.value.settings.email,()=>mailRevision.value++);
const transfer = ref<'import' | 'export'>();
const overlayOpen = computed(() => settingsOpen.value || bookmarkDialog.value || !!transfer.value || creatingFolder.value || !!editingFolder.value);
const exportText = ref('');
const context = shallowRef<{ x: number; y: number; bookmark?: Bookmark; folder?: Folder }>();
const backgroundUrl = ref('');
let decodedBackground: {url:string;image:HTMLImageElement}|undefined;
const backgroundResource=new BackgroundResource(async url=>{
  backgroundUrl.value=url;
  if(url && decodedBackground?.url===url)cacheBackgroundPreview(decodedBackground.image);
  else if(!url)clearBackgroundPreview();
  decodedBackground=undefined;
  await nextTick();
},async url=>{
  const image=new Image();image.src=url;await image.decode();
  decodedBackground={url,image};
});
watch([() => snapshot.value.background, loading], ([blob,isLoading]) => {
  if(!blob && isLoading)return;
  if(!blob)clearBackgroundPreview();
  void backgroundResource.replace(blob).catch(error=>{notice.value='Не удалось показать фон. '+String(error);});
});
onUnmounted(() => backgroundResource.dispose());
const fail = (error: unknown) => error instanceof Error ? error.message : String(error);
function add() { void openBookmark(); }
function showContext(event: MouseEvent | KeyboardEvent, bookmark?: Bookmark) {
  if ((event.target as HTMLElement).closest('input,textarea,button,dialog') || disabled.value || overlayOpen.value) return;
  event.preventDefault();
  rememberContextTarget(event.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement);
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  context.value = { x: event instanceof MouseEvent ? event.clientX : bounds.left, y: event instanceof MouseEvent ? event.clientY : bounds.bottom, bookmark };
}
function showFolderContext(event: MouseEvent | KeyboardEvent, folder: Folder) {
  if (folder.virtual || disabled.value || overlayOpen.value) return;
  rememberContextTarget(event.currentTarget as HTMLElement);
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  context.value = { x: event instanceof MouseEvent ? event.clientX : bounds.left, y: event instanceof MouseEvent ? event.clientY : bounds.bottom, folder };
}
async function saveBookmark(value: { url: string; title: string; capture: boolean; parentId?: string; titleEdited: boolean }) {
  if (disabled.value) return;
  savingBookmark.value = true;
  dialogError.value = '';
  folderError.value = '';
  try {
    const url = normalizeUrl(value.url);
    try { await repository.parent(value.parentId); }
    catch (error) { folderError.value = fail(error); return; }
    const selected = editing.value;
    const idResult = { id: selected?.id ?? '' };
    let capture = !selected && value.capture;
    if (!await run(async () => {
      if (selected) capture = await repository.edit(selected.id, url, value.title, value.parentId, value.titleEdited, selected);
      else idResult.id = await repository.add({ url, title: value.title, parentId: value.parentId });
    })) { dialogError.value = notice.value; return; }
    bookmarkDialog.value = false;
    if (capture) {
      capturing.value = true;
      try { await updateImages(idResult.id, url); }
      catch (error) { notice.value = 'Закладка сохранена. ' + fail(error); }
      finally { capturing.value = false; }
    }
  } catch (error) { dialogError.value = fail(error); }
  finally { savingBookmark.value = false; }
}
async function action(name: string) {
  const selected = context.value?.bookmark;
  const folder = context.value?.folder;
  const moveExpected = contextOrder.value.slice();
  const moveRevision = revision.value;
  const returnTarget = contextTarget;
  closeContext();
  try {
    if ((selected || folder) && (name === 'move-left' || name === 'move-right')) {
      const id = (selected || folder)!.id;
      const direction = name === 'move-left' ? -1 : 1;
      const neighbor = moveExpected[moveExpected.indexOf(id) + direction];
      if (!neighbor || (selected && searching.value)) return;
      const ids = insertedOrder(moveExpected, id, neighbor, direction > 0);
      if (ids) await run(() => {
        if (moveRevision !== revision.value) throw new Error('Список изменился; повторите перемещение.');
        return folder ? repository.reorderFolders(ids, moveExpected) : repository.reorder(ids, moveExpected, selected!.parentId);
      });
      return;
    }
    if (folder && name !== 'folder') {
      if (name === 'edit' || name === 'delete') await folderAction(name === 'edit' ? 'rename' : 'delete', folder.id);
      return;
    }
    if (name === 'add') await openBookmark();
    if (name === 'folder') await folderAction('create');
    if (name === 'settings') openSettings();
    if (!selected) return;
    if (name === 'open') await browser.tabs.create({ url: selected.url });
    if (name === 'edit') await openBookmark(selected);
    if (name === 'delete' && confirm('Удалить настоящую закладку браузера? Удаление может синхронизироваться на другие устройства.'))
      await run(() => repository.remove(selected.id));
    if (name === 'thumbnail') {
      notice.value = 'Сайт временно откроется для обновления эскиза…';
      capturing.value = true;
      try {
        await updateImages(selected.id, selected.url);
        notice.value = 'Изображения обновлены.';
      } finally { capturing.value = false; }
    }
  } catch (error) { notice.value = fail(error); }
  finally { if (!overlayOpen.value) restorePageFocus(returnTarget); }
}
async function openExport() {
  if (disabled.value) return;
  try {
    if (await run(async () => { exportText.value = await serializeExport(await repository.exportData()); })) {
      settingsOpen.value = false; transfer.value = 'export';
    }
  } catch (error) { notice.value = fail(error); }
}
async function importData(text: string) {
  if (disabled.value) return;
  try {
    importError.value = '';
    const next = parseImport(text);
    const path = (await repository.choices()).find(row => row.id === snapshot.value.rootId)?.path;
    if (!path) throw new Error('Выберите папку закладок в настройках.');
    if (!confirm('Импорт добавит закладки и папки в папку «' + path + '»; возможны дубликаты. Настройки и фон будут применены. Продолжить?')) return;
    if (await run(() => repository.importData(next),true)) { transfer.value = undefined; mailRevision.value++; notice.value = 'Данные импортированы.'; }
    else importError.value = notice.value;
  } catch (error) { importError.value = fail(error); }
}
function reorder(ids: string[], expected: string[], dragRevision: number) { const parent = snapshot.value.activeId; if (!searching.value) void run(() => { if (dragRevision !== revision.value) throw new Error('Список изменился; повторите перетаскивание.'); return repository.reorder(ids, expected, parent); }); }
async function reset() {
  if (confirm('Сбросить настройки, фон и локальный кэш изображений? Закладки браузера сохранятся.')) {
    if (await run(() => repository.reset(),true)) { settingsOpen.value = false; notice.value = 'Настройки и локальный кэш сброшены. Закладки сохранены.'; }
  }
}
async function updateImages(id: string, url: string) {
  const ticket = await repository.autoNameTicket(id);
  const expected = await repository.bookmark(id);
  if (expected.url !== url) throw new Error('Адрес закладки изменён.');
  const results = await Promise.allSettled([
    requestThumbnail(url).then(async result => {
      await repository.cache(id, url, 'thumbnail', result.thumbnail, expected);
      const icon = await faviconBlob(url, result.favicon);
      if (icon) await repository.cache(id, url, 'favicon', icon, expected);
      await repository.applyCapturedTitle(id, url, result.title, ticket).catch(() => {});
    }),
    faviconBlob(url).then(async blob => { if (blob) await repository.cache(id, url, 'favicon', blob, expected); }),
  ]);
  await refresh(); announce();
  if (results[0]?.status === 'rejected') throw results[0].reason;
}
async function selectFolder(id: string) { if (bookmarkMode.value) closeSearch(); repository.selectFolder(id); try { await refresh(); } catch (error) { notice.value = fail(error); } }
async function beginFolder() {
  if (disabled.value || !snapshot.value.rootId) return;
  context.value = undefined;
  editingFolder.value = undefined;
  folderDialogError.value = '';
  creatingFolder.value = true;
}
async function cancelFolder() {
  if (disabled.value) return;
  creatingFolder.value = false;
  editingFolder.value = undefined;

}
async function saveFolder(title: string) {
  if (disabled.value || (!creatingFolder.value && !editingFolder.value)) return;
  const selected = editingFolder.value;
  folderDialogError.value='';
  if (await run(() => selected ? repository.renameFolder(selected.id, title) : repository.createFolder(title))) await cancelFolder();
  else {folderDialogError.value=notice.value;notice.value='';}
}
async function folderAction(name: 'create' | 'rename' | 'delete', id = snapshot.value.activeId) {
  if (name === 'create') { await beginFolder(); return; }
  if (!id || id === snapshot.value.rootId) return;
  if (name === 'rename') {
    if (disabled.value) return;
    const folder = await repository.folder(id);
    creatingFolder.value = false;
    folderDialogError.value='';
    editingFolder.value = { id, title: folder.title };
  }
  if (name === 'delete' && confirm('Удалить реальную папку браузера и ВСЕ её потомки, включая скрытые вложенные папки? Удаление может синхронизироваться на другие устройства.')) await run(() => repository.removeFolder(id));
}
async function reorderFolders(ids: string[], expected: string[], dragRevision: number) { await run(() => { if (dragRevision !== revision.value) throw new Error('Список изменился; повторите перетаскивание.'); return repository.reorderFolders(ids, expected); }); }
type FocusTarget = { element: HTMLElement; selector?: string; id?: string; index: number };
function focusTarget(element: Element | null): FocusTarget | undefined {
  if (!(element instanceof HTMLElement) || element === document.body || element.tabIndex < 0) return;
  const selector = element.matches('.bookmark') ? '.bookmark' : element.matches('[data-folder-id]') ? '[data-folder-id]' : undefined;
  return {element, selector, id:element.dataset.bookmarkId ?? element.dataset.folderId,
    index:selector ? Array.from(document.querySelectorAll(selector)).indexOf(element) : 0};
}
function restorePageFocus(target?: FocusTarget) {
  if (overlayOpen.value || context.value) return;
  const candidates = target?.selector ? Array.from(document.querySelectorAll<HTMLElement>(target.selector)) : [];
  const same = candidates.find(el => (el.dataset.bookmarkId ?? el.dataset.folderId) === target?.id);
  const element = same ?? (target?.element.isConnected ? target.element : candidates[Math.min(target?.index ?? 0,candidates.length-1)]);
  const usable = (el?: HTMLElement | null) => !!el && el.isConnected && !el.closest('[inert],[aria-hidden="true"]') && !el.matches(':disabled') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const fallbacks = target?.selector
    ? ['.add-card:not(:disabled)','.search input:not(:disabled)','.folder-root:not(:disabled)','.settings-trigger:not(:disabled)']
    : ['.settings-trigger:not(:disabled)'];
  const fallback = fallbacks.map(selector => document.querySelector<HTMLElement>(selector)).find(el => usable(el));
  if (usable(element)) element!.focus({preventScroll:true});
  else if (usable(fallback)) fallback!.focus({preventScroll:true});
}
let contextTarget: FocusTarget | undefined;
function rememberContextTarget(element: Element | null = document.activeElement) { contextTarget = focusTarget(element); }
function closeContext() { context.value = undefined; restorePageFocus(contextTarget); }
const contextOrder = computed(() => context.value?.folder ? snapshot.value.folders.filter(row=>!row.virtual).map(row=>row.id) : snapshot.value.tabs.map(row=>row.id));
function canMove(direction: number) {
  const id = context.value?.folder?.id ?? context.value?.bookmark?.id;
  const index = id ? contextOrder.value.indexOf(id) : -1;
  return !disabled.value && !(context.value?.bookmark && searching.value) && index >= 0 && index + direction >= 0 && index + direction < contextOrder.value.length;
}
// Capture focus before Vue removes a node. Restore only if that update lost it;
// typing, pointer focus and a newly opened overlay always take precedence.
watch([snapshot, results, disabled], async () => {
  const previous = focusTarget(document.activeElement);
  await nextTick();
  if (!previous || overlayOpen.value || context.value) return;
  const active = document.activeElement;
  if (active === document.body || active === previous.element && (!previous.element.isConnected || previous.element.closest('[inert]'))) restorePageFocus(previous);
}, {flush:'pre'});
const dialogReturnTargets=new WeakMap<Element,FocusTarget>();
function beforeDialogEnter(element:Element){
  if(document.activeElement instanceof HTMLElement)dialogReturnTargets.set(element,focusTarget(document.activeElement)!);
}
function restoreDialogFocus(element:Element){
  const previous=dialogReturnTargets.get(element);dialogReturnTargets.delete(element);
  if(overlayOpen.value||context.value)return;
  restorePageFocus(previous);
}
function beforeDialogLeave(element: Element) { (element as HTMLElement).inert = true; }
function escape(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (contextKey(event) && !overlayOpen.value && !context.value && !disabled.value && !(event.target as HTMLElement).closest('input,textarea,select,[contenteditable],dialog')) {
    event.preventDefault(); rememberContextTarget(document.activeElement);
    context.value = {x:24,y:100}; return;
  }
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !disabled.value && snapshot.value.settings.bookmarkSearch && snapshot.value.rootId && !overlayOpen.value && !context.value && !(event.target as HTMLElement).closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog,[role="dialog"]')) {
    event.preventDefault(); openSearch(); return;
  }
  if (event.key !== 'Escape' || disabled.value || event.defaultPrevented || (event.target instanceof Element && event.target.closest('dialog'))) return;
  if (searching.value && !overlayOpen.value && !context.value) { event.preventDefault(); closeSearch(); return; }
  if(context.value)closeContext();else void closeSettings();
}
window.addEventListener('keydown', escape);
onUnmounted(() => window.removeEventListener('keydown', escape));
</script>
<template>
  <div :data-keyboard-focus="keyboardFocus||undefined" class="page relative font-[family-name:var(--ui-font)] leading-[normal] min-h-screen bg-center bg-cover bg-no-repeat [:where(&)_button]:cursor-pointer [&_button:disabled]:cursor-default [&_button:disabled]:opacity-100 [:where(&)_button]:font-[family-name:var(--ui-font)] [:where(&)_input]:font-[family-name:var(--ui-font)] [:where(&)_textarea]:font-[family-name:var(--ui-font)] [:where(&)_button]:text-base [:where(&)_input]:text-base [:where(&)_textarea]:text-base [:where(&)_button]:font-normal [:where(&)_button]:leading-[normal] [:where(&)_input]:leading-[normal] [:where(&)_textarea]:leading-[normal] [:where(&)_button]:[-webkit-tap-highlight-color:transparent] [&_a]:[-webkit-tap-highlight-color:transparent] [:where(&)_input]:[-webkit-tap-highlight-color:transparent] [:where(&)_textarea]:[-webkit-tap-highlight-color:transparent] [&_input::placeholder]:text-[#757575] [&_textarea::placeholder]:text-[#757575] [&_input::placeholder]:opacity-100 [&_textarea::placeholder]:opacity-100 [&_*]:motion-reduce:transition-none [&_*]:motion-reduce:animate-none [&_*::before]:motion-reduce:transition-none [&_*::after]:motion-reduce:transition-none" @contextmenu="showContext">
    <div aria-hidden="true" class="page-background fixed inset-0 pointer-events-none bg-center bg-cover bg-no-repeat" :class="{ 'is-ready': !!backgroundUrl }" :style="{ backgroundImage: backgroundUrl ? 'url(' + backgroundUrl + ')' : undefined, backgroundColor: backgroundUrl ? '#808590' : undefined }"/>
    <main class="dial relative flex flex-col p-6 min-h-screen motion-reduce:transition-none [&.pushed]:pointer-events-none" :class="{ pushed: settingsOpen, 'is-loaded': !loading }">
      <header class="relative shrink-0" :class="{'startup-reveal':!loading}">
        <SearchBar ref="searchControl" v-model="searchText" :bookmark-search="snapshot.settings.bookmarkSearch" :movie-search="snapshot.settings.movieSearch" @submit-bookmarks="focusSearchResult" :provider="snapshot.settings.searchProvider" :disabled="disabled" :save-provider="changeSearchProvider" />
        <div class="tools flex items-center gap-2">
          <MailIndicator :key="mailRevision" :email="snapshot.settings.email" />
          <button class="settings-trigger ui-folder inline-flex size-12 items-center justify-center" aria-label="Настройки" title="Настройки" aria-haspopup="dialog" :aria-expanded="settingsOpen" :aria-controls="settingsOpen?'settings-modal':undefined" :disabled="disabled" @click="openSettings"><svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><g transform="translate(0 1)"><path d="m9 3-1 3-3 1-2 4 2 2v3l4 3 3-1 3 1 4-3v-3l2-2-2-4-3-1-1-3Z"/><circle cx="12" cy="11" r="3"/></g></svg></button>
        </div>
      </header>
      <div class="bookmark-area flex flex-col flex-1" :class="{ 'justify-center': snapshot.settings.verticalCenter }">
        <div v-if="!loading && !snapshot.rootId" class="surface-empty startup-reveal text-center my-8"><p>Выберите папку закладок в настройках.</p><button class="mt-3" :disabled="disabled" @click="openSettings">Открыть настройки</button></div>
        <template v-else-if="!loading">
        <div v-if="snapshot.folders.length || creatingFolder" class="bookmark-toolbar startup-reveal relative flex items-center min-h-12 my-4 mx-auto" :style="{ width: snapshot.settings.width + '%' }">
        <FolderTabs :context-id="context ? contextTarget?.id : undefined" :motion-enabled="motionEnabled" :revision="revision" :folders="snapshot.folders" :active-id="snapshot.activeId" :disabled="disabled" :creating="creatingFolder" :editing="editingFolder" @select="selectFolder" @context="showFolderContext" @background="event => { if (!disabled && !overlayOpen) { rememberContextTarget(); context = {x:event.clientX,y:event.clientY}; } }" @reorder="reorderFolders" @refresh="refresh" />
        </div>
        <p v-if="searching && searchError" role="alert" class="surface-empty text-center my-4">{{ searchError }} <button @click.stop="revision++">Повторить</button></p>
        <EmptyState v-else-if="showEmptySearch" class="bookmark-search-empty my-6" title="Закладки не найдены" description="Попробуйте другое название или адрес сайта." action-label="Очистить поиск" symbol="search" announce :disabled="disabled" @action="closeSearch();searchControl?.focus()" :style="{ width: 'min(440px,' + snapshot.settings.width + '%)' }" />
        <BookmarkGrid :context-id="context ? contextTarget?.id : undefined" :motion-enabled="motionEnabled" :folder-id="snapshot.activeId" :revision="revision" :folder-names="Object.fromEntries(snapshot.folders.map(row=>[row.id,row.title]))" :tabs="searching ? results : snapshot.tabs" :searching="searching" :settings="snapshot.settings" :disabled="disabled"
          @add="add" @context="showContext" @reorder="reorder" @refresh="refresh" />
        </template>
      </div>
    </main>
    <div v-if="!settingsOpen && Object.keys(settingErrors).length" role="alert" class="fixed bottom-4 left-4 right-4 p-4 rounded-[var(--ui-radius)] shadow-[var(--ui-shadow-popover)] bg-[#fff8d6] z-50 break-words">{{Object.values(settingErrors).join(' ')}}</div>
    <div v-if="notice && !settingsOpen" role="status" class="notice fixed bottom-4 left-4 right-4 p-4 rounded-[var(--ui-radius)] shadow-[var(--ui-shadow-popover)] flex justify-between items-start gap-3 bg-[#fff8d6] z-50 [overflow-wrap:anywhere]">
      <span>{{ notice }}</span><button class="ui-hover rounded-full" aria-label="Закрыть уведомление" @click="notice = ''">×</button>
    </div>
    <Transition name="settings-panel" :duration="motionEnabled ? 250 : 0" @before-leave="beforeDialogLeave" @after-leave="restoreDialogFocus" @before-enter="beforeDialogEnter">
    <SettingsPanel v-if="settingsOpen" ref="settingsPanel" :settings="snapshot.settings" :root-id="snapshot.rootId" :operation-error="Object.values(settingErrors).join(' ')" :busy="disabled" :has-background="!!snapshot.background" :update-settings="updateSettings" :change-root="changeRoot" :change-background="changeBackground" @close="closeSettings"
      @import="settingsOpen = false; importError = ''; transfer = 'import'" @export="openExport" @reset="reset" @error="notice=$event" />
    </Transition>
    <Transition name="modal-panel" :duration="motionEnabled ? 250 : 0" @before-enter="beforeDialogEnter" @before-leave="beforeDialogLeave" @after-leave="restoreDialogFocus">
      <FolderDialog v-if="creatingFolder || editingFolder" :title="editingFolder?.title" :busy="disabled" :error="folderDialogError" @close="cancelFolder" @save="saveFolder" />
    </Transition>
    <Transition name="modal-panel" :duration="motionEnabled ? 250 : 0" @before-enter="beforeDialogEnter" @before-leave="beforeDialogLeave" @after-leave="restoreDialogFocus">
    <BookmarkDialog v-if="bookmarkDialog" :bookmark="editing" :folders="dialogFolders" :active-id="snapshot.activeId" :folder-error="folderError" :busy="disabled" :error="dialogError" @close="bookmarkDialog = false" @save="saveBookmark" />
    </Transition>
    <Transition name="modal-panel" :duration="motionEnabled ? 250 : 0" @before-enter="beforeDialogEnter" @before-leave="beforeDialogLeave" @after-leave="restoreDialogFocus">
    <ImportExportDialog v-if="transfer" :mode="transfer" :value="exportText" :busy="disabled" :operation-error="importError" @close="transfer = undefined" @import="importData" />
    </Transition>
    <Transition name="floating" :duration="motionEnabled ? 150 : 0" @before-enter="element => { (element as HTMLElement).inert = false; element.removeAttribute('aria-hidden'); }" @before-leave="element => { beforeDialogLeave(element); element.setAttribute('aria-hidden','true'); }">
      <ContextMenu v-if="context" :x="context.x" :y="context.y" :bookmark="context.bookmark" :folder="context.folder" :can-move-left="canMove(-1)" :can-move-right="canMove(1)" @close="closeContext" @action="action" />
    </Transition>
  </div>
</template>
