<script setup lang="ts">
import { ref, shallowRef, computed, watch, nextTick, onUnmounted } from 'vue';
import { browser } from 'wxt/browser';
import CategoryNameInput from './components/CategoryNameInput.vue';
import { faviconBlob } from './services/favicons';
import BookmarkGrid from './components/BookmarkGrid.vue';
import BookmarkSearch from './components/BookmarkSearch.vue';
import { useBookmarkSearch } from './composables/useBookmarkSearch';
import BookmarkDialog from './components/BookmarkDialog.vue';
import SearchBar from './components/SearchBar.vue';
import MailIndicator from './components/MailIndicator.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import ContextMenu from './components/ContextMenu.vue';
import ImportExportDialog from './components/ImportExportDialog.vue';
import { useDial, repository } from './composables/useDial';
import { requestThumbnail } from './services/thumbnails';
import { parseImport, serializeExport } from './services/importExport';
import { normalizeUrl } from './services/validation';
import { BackgroundResource } from './utils/backgroundResource';
import { appearanceTokens } from './utils/appearance';
import type { Bookmark, Category } from './types/models';

const { snapshot, loading, busy, notice, run, refresh, announce, revision, changeSearchProvider, updateSettings, changeRoot, changeBackground, flushSettings, settingErrors,previewSettings } = useDial();
const appearance=computed(()=>appearanceTokens(snapshot.value.settings));
watch(()=>snapshot.value.settings.uiAccent,accent=>{
  document.documentElement.style.setProperty('--scrollbar-accent',accent);
},{immediate:true});
onUnmounted(()=>document.documentElement.style.removeProperty('--scrollbar-accent'));
const { query, results, pending: searchPending, error: searchError } = useBookmarkSearch(repository, snapshot, revision);
const searchOpen = ref(false);
const searchControl = ref<InstanceType<typeof BookmarkSearch>>();
const searching = computed(() => searchOpen.value && !!query.value.trim());
const showEmptySearch = ref(false);
let emptySearchTimer: ReturnType<typeof setTimeout> | undefined;
watch([query, searchOpen, searchPending, searchError, results], () => {
  clearTimeout(emptySearchTimer);
  showEmptySearch.value = false;
  if (searching.value && !searchPending.value && !searchError.value && !results.value.length)
    emptySearchTimer = setTimeout(() => { showEmptySearch.value = true; }, 400);
}, { flush: 'sync' });
onUnmounted(() => clearTimeout(emptySearchTimer));
function openSearch() { if (!snapshot.value.settings.bookmarkSearch) return; searchOpen.value = true; void searchControl.value?.focus(); }
function closeSearch(restoreFocus = true) { searchOpen.value = false; query.value = ''; if (restoreFocus) void searchControl.value?.restoreFocus(); }
watch(() => snapshot.value.settings.bookmarkSearch, enabled => { if (!enabled) closeSearch(false); });
const capturing = ref(false);
const categoryDrag = ref<string>();
const creatingCategory = ref(false);
const editingCategory = shallowRef<{ id: string; title: string }>();
const categoryAddButton = ref<HTMLButtonElement>();
watch(() => snapshot.value.rootId, () => { creatingCategory.value = false; editingCategory.value = undefined; });
const disabled = computed(() => loading.value || busy.value || capturing.value);
const settingsOpen = ref(false);
const settingsPanel = ref<InstanceType<typeof SettingsPanel>>();
async function closeSettings(){await settingsPanel.value?.flush();await flushSettings();settingsOpen.value=false;}
function openSettings() { settingsOpen.value = true; }
const bookmarkDialog = ref(false);
const editing = shallowRef<Bookmark>();
const dialogError = ref('');
const importError = ref('');
const mailRevision = ref(0);
watch(()=>snapshot.value.settings.email,()=>mailRevision.value++);
const transfer = ref<'import' | 'export'>();
const exportText = ref('');
const context = shallowRef<{ x: number; y: number; bookmark?: Bookmark; category?: Category }>();
const backgroundUrl = ref('');
const backgroundResource=new BackgroundResource(async url=>{backgroundUrl.value=url;await nextTick();},async url=>{
  const image=new Image();image.src=url;await image.decode();
});
watch(() => snapshot.value.background, blob => {void backgroundResource.replace(blob).catch(error=>{notice.value='Не удалось показать фон. '+String(error);});});
onUnmounted(() => backgroundResource.dispose());
const fail = (error: unknown) => error instanceof Error ? error.message : String(error);
function add() { if (disabled.value) return; editing.value = undefined; dialogError.value = ''; bookmarkDialog.value = true; }
function showContext(event: MouseEvent, bookmark?: Bookmark) {
  if ((event.target as HTMLElement).closest('input,textarea,button,dialog') || disabled.value || settingsOpen.value || bookmarkDialog.value || transfer.value) return;
  event.preventDefault();
  context.value = { x: event.clientX, y: event.clientY, bookmark };
}
function showCategoryContext(event: MouseEvent | KeyboardEvent, category: Category) {
  if (category.virtual || disabled.value || settingsOpen.value || bookmarkDialog.value || transfer.value) return;
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  context.value = { x: event instanceof MouseEvent ? event.clientX : bounds.left, y: event instanceof MouseEvent ? event.clientY : bounds.bottom, category };
}
async function saveBookmark(value: { url: string; title: string; capture: boolean; parentId?: string }) {
  if (disabled.value) return;
  dialogError.value = '';
  try {
    const url = normalizeUrl(value.url);
    const selected = editing.value;
    if (selected) {
      if (await run(() => repository.edit(selected.id, url, value.title, value.parentId))) bookmarkDialog.value = false;
      else dialogError.value = notice.value;
      return;
    }
    const idResult = { id: '' };
    if (!await run(async () => { idResult.id = await repository.add({ url, title: value.title }); })) { dialogError.value = notice.value; return; }
    bookmarkDialog.value = false;
    if (value.capture) {
      capturing.value = true;
      try { await updateImages(idResult.id, url); }
      catch (error) { notice.value = 'Закладка сохранена. ' + fail(error); }
      finally { capturing.value = false; }
    }
  } catch (error) { dialogError.value = fail(error); }
}
async function action(name: string) {
  const selected = context.value?.bookmark;
  const category = context.value?.category;
  context.value = undefined;
  try {
    if (category) {
      if (name === 'edit' || name === 'delete') await categoryAction(name === 'edit' ? 'rename' : 'delete', category.id);
      return;
    }
    if (name === 'add') add();
    if (name === 'category') await categoryAction('create');
    if (name === 'settings') openSettings();
    if (!selected) return;
    if (name === 'open') await browser.tabs.create({ url: selected.url });
    if (name === 'edit') { editing.value = selected; dialogError.value = ''; bookmarkDialog.value = true; }
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
    if (!confirm('Импорт добавит закладки и категории в папку «' + path + '»; возможны дубликаты. Настройки и фон будут применены. Продолжить?')) return;
    if (await run(() => repository.importData(next),true)) { transfer.value = undefined; mailRevision.value++; notice.value = 'Данные импортированы.'; }
    else importError.value = notice.value;
  } catch (error) { importError.value = fail(error); }
}
function reorder(ids: string[]) { if (!searching.value) void run(() => repository.reorder(ids)); }
async function reset() {
  if (confirm('Сбросить настройки, фон и локальный кэш изображений? Закладки браузера сохранятся.')) {
    if (await run(() => repository.reset(),true)) { settingsOpen.value = false; notice.value = 'Настройки и локальный кэш сброшены. Закладки сохранены.'; }
  }
}
async function updateImages(id: string, url: string) {
  const results = await Promise.allSettled([
    requestThumbnail(url).then(async result => {
      await repository.cache(id, url, 'thumbnail', result.thumbnail);
      const icon = await faviconBlob(url, result.favicon);
      if (icon) await repository.cache(id, url, 'favicon', icon);
    }),
    faviconBlob(url).then(async blob => { if (blob) await repository.cache(id, url, 'favicon', blob); }),
  ]);
  await refresh(); announce();
  if (results[0]?.status === 'rejected') throw results[0].reason;
}
async function selectCategory(id: string) { if (searchOpen.value) closeSearch(); repository.selectCategory(id); try { await refresh(); } catch (error) { notice.value = fail(error); } }
async function beginCategory() {
  if (disabled.value || !snapshot.value.rootId) return;
  context.value = undefined;
  editingCategory.value = undefined;
  creatingCategory.value = true;
}
async function cancelCategory() {
  if (disabled.value) return;
  creatingCategory.value = false;
  editingCategory.value = undefined;
  await nextTick();
  categoryAddButton.value?.focus();
}
async function saveCategory(title: string) {
  if (disabled.value || (!creatingCategory.value && !editingCategory.value)) return;
  const selected = editingCategory.value;
  if (await run(() => selected ? repository.renameCategory(selected.id, title) : repository.createCategory(title))) await cancelCategory();
}
async function categoryAction(name: 'create' | 'rename' | 'delete', id = snapshot.value.activeId) {
  if (name === 'create') { await beginCategory(); return; }
  if (!id || id === snapshot.value.rootId) return;
  if (name === 'rename') {
    if (disabled.value) return;
    const category = await repository.category(id);
    creatingCategory.value = false;
    editingCategory.value = { id, title: category.title };
  }
  if (name === 'delete' && confirm('Удалить реальную папку браузера и ВСЕ её потомки, включая скрытые вложенные папки? Удаление может синхронизироваться на другие устройства.')) await run(() => repository.removeCategory(id));
}
async function dropCategory(id: string) {
  const source = categoryDrag.value;
  categoryDrag.value = undefined;
  if (source && source !== id) await run(() => repository.moveCategory(source, id));
}
function beforeDialogLeave(element: Element) { (element as HTMLElement).inert = true; }
function escape(event: KeyboardEvent) {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !disabled.value && snapshot.value.settings.bookmarkSearch && snapshot.value.rootId && !settingsOpen.value && !bookmarkDialog.value && !transfer.value && !context.value && !(event.target as HTMLElement).closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog,[role="dialog"]')) {
    event.preventDefault(); openSearch(); return;
  }
  if (event.key !== 'Escape' || disabled.value) return;
  if (searchOpen.value && !settingsOpen.value && !bookmarkDialog.value && !transfer.value && !context.value) { event.preventDefault(); closeSearch(); return; }
  context.value = undefined;void closeSettings();
}
window.addEventListener('keydown', escape);
onUnmounted(() => window.removeEventListener('keydown', escape));
</script>
<template>
  <div class="page relative font-[family-name:var(--ui-font)] leading-[normal] min-h-screen bg-[#808590] bg-center bg-cover bg-no-repeat [:where(&)_button]:cursor-pointer [&_button:disabled]:cursor-default [&_button:disabled]:opacity-100 [:where(&)_button]:font-[family-name:var(--ui-font)] [:where(&)_input]:font-[family-name:var(--ui-font)] [:where(&)_textarea]:font-[family-name:var(--ui-font)] [:where(&)_button]:text-base [:where(&)_input]:text-base [:where(&)_textarea]:text-base [:where(&)_button]:font-normal [:where(&)_button]:leading-[normal] [:where(&)_input]:leading-[normal] [:where(&)_textarea]:leading-[normal] [:where(&)_button]:[-webkit-tap-highlight-color:transparent] [&_a]:[-webkit-tap-highlight-color:transparent] [:where(&)_input]:[-webkit-tap-highlight-color:transparent] [:where(&)_textarea]:[-webkit-tap-highlight-color:transparent] [&_input::placeholder]:text-[#757575] [&_textarea::placeholder]:text-[#757575] [&_input::placeholder]:opacity-100 [&_textarea::placeholder]:opacity-100 [&_*]:motion-reduce:transition-none [&_*]:motion-reduce:animate-none [&_*::before]:motion-reduce:transition-none [&_*::after]:motion-reduce:transition-none" :style="appearance" @contextmenu="showContext">
    <div aria-hidden="true" class="page-background absolute inset-0 pointer-events-none bg-[#808590] bg-center bg-cover bg-no-repeat" :class="{ 'is-blurred': settingsOpen }" :style="{ backgroundImage: backgroundUrl ? 'url(' + backgroundUrl + ')' : undefined }"/>
    <main class="dial relative flex flex-col p-6 min-h-screen transition-all duration-250 ease-in-out motion-reduce:transition-none [&.pushed]:-translate-x-[300px] [&.pushed]:pointer-events-none" :class="{ pushed: settingsOpen }">
      <header class="relative shrink-0">
        <SearchBar :provider="snapshot.settings.searchProvider" :disabled="disabled" :save-provider="changeSearchProvider" />
        <div class="tools flex items-center gap-4 absolute right-0 top-0 block">
          <MailIndicator :key="mailRevision" :email="snapshot.settings.email" />
          <button class="sr-only focus:not-sr-only" aria-label="Настройки" :disabled="disabled" @click="openSettings">Настройки</button>
        </div>
      </header>
      <div class="bookmark-area flex flex-col flex-1" :class="{ 'justify-center': snapshot.settings.verticalCenter }">
        <p v-if="loading" role="status" class="text-white text-center">Загрузка…</p>
        <div v-else-if="!snapshot.rootId" class="text-white text-center my-8"><p>Выберите папку закладок в настройках.</p><button class="mt-3" :disabled="disabled" @click="openSettings">Открыть настройки</button></div>
        <template v-else>
        <div v-if="snapshot.settings.bookmarkSearch || snapshot.categories.length || creatingCategory" class="bookmark-toolbar relative flex items-center min-h-9 my-4 mx-auto" :style="{ width: snapshot.settings.width + '%' }">
        <nav v-if="snapshot.categories.length || creatingCategory" aria-label="Категории" class="flex flex-wrap gap-3 min-w-0 w-full" :class="{ invisible: searchOpen, 'pr-12': snapshot.settings.bookmarkSearch }" :inert="searchOpen" :aria-hidden="searchOpen || undefined">
          <template v-for="category in snapshot.categories" :key="category.id">
          <CategoryNameInput v-if="editingCategory?.id === category.id" :title="editingCategory.title" :disabled="disabled" @save="saveCategory" @cancel="cancelCategory" />
          <button v-else :disabled="disabled" :aria-pressed="category.id === snapshot.activeId" class="ui-category p-2" :draggable="!category.virtual && !disabled" :aria-haspopup="!category.virtual ? 'menu' : undefined" @contextmenu.stop.prevent="showCategoryContext($event, category)" @keydown.shift.f10.stop.prevent="showCategoryContext($event, category)" @click="selectCategory(category.id)" @dragstart="categoryDrag = category.id" @dragend="categoryDrag = undefined" @dragover.prevent @drop.prevent="!category.virtual && dropCategory(category.id)"><span class="ui-action-label">{{ category.title }}</span></button></template>
          <CategoryNameInput v-if="creatingCategory" :disabled="disabled" @save="saveCategory" @cancel="cancelCategory" />
          <button v-else ref="categoryAddButton" class="inline-flex items-center justify-center size-[calc(1lh+1rem)] shrink-0 ui-control" aria-label="Новая категория" title="Новая категория" :disabled="disabled" @click="beginCategory">+</button>
        </nav>
        <BookmarkSearch v-if="snapshot.settings.bookmarkSearch" ref="searchControl" :open="searchOpen" v-model:query="query" :disabled="disabled" @open="openSearch" @close="closeSearch" />
        </div>
        <p v-if="searching && searchError" role="alert" class="text-white text-center my-4">{{ searchError }} <button @click.stop="revision++">Повторить</button></p>
        <div v-else-if="showEmptySearch" role="status" class="mx-auto min-h-36 flex flex-col items-center justify-center gap-2 ui-glass p-6 text-center text-[#454952]" :style="{ width: snapshot.settings.width + '%' }">
          <svg class="mb-1 opacity-50" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
          <p>Закладки не найдены</p>
          <p class="text-sm opacity-75">Попробуйте другое название или адрес сайта.</p>
        </div>
        <BookmarkGrid :tabs="searching ? results : snapshot.tabs" :searching="searching" :settings="snapshot.settings" :disabled="disabled"
          @add="add" @context="showContext" @reorder="reorder" />
        </template>
      </div>
    </main>
    <div v-if="!settingsOpen && Object.keys(settingErrors).length" role="alert" class="fixed bottom-4 left-4 right-4 p-4 rounded-[var(--ui-radius)] shadow-[var(--ui-shadow-popover)] bg-[#fff8d6] z-50 break-words">{{Object.values(settingErrors).join(' ')}}</div>
    <div v-if="notice && !settingsOpen" role="status" class="notice fixed bottom-4 left-4 right-4 p-4 rounded-[var(--ui-radius)] shadow-[var(--ui-shadow-popover)] flex justify-between items-start gap-3 bg-[#fff8d6] z-50 [overflow-wrap:anywhere]">
      <span>{{ notice }}</span><button aria-label="Закрыть уведомление" @click="notice = ''">×</button>
    </div>
    <Transition leave-active-class="[&_.settings]:animate-none [&_.settings]:transition-transform [&_.settings]:duration-250 motion-reduce:[&_.settings]:transition-none" leave-to-class="[&_.settings]:translate-x-full" :duration="250" @before-leave="beforeDialogLeave">
    <SettingsPanel v-if="settingsOpen" ref="settingsPanel" :settings="snapshot.settings" :root-id="snapshot.rootId" :operation-error="Object.values(settingErrors).join(' ')" :busy="disabled" :has-background="!!snapshot.background" :update-settings="updateSettings" :preview-settings="previewSettings" :change-root="changeRoot" :change-background="changeBackground" @close="closeSettings"
      @import="settingsOpen = false; importError = ''; transfer = 'import'" @export="openExport" @reset="reset" @error="notice=$event" />
    </Transition>
    <Transition enter-active-class="transition-opacity duration-250 motion-reduce:transition-none" leave-active-class="transition-opacity duration-250 motion-reduce:transition-none" enter-from-class="opacity-0" leave-to-class="opacity-0" :duration="250" @before-leave="beforeDialogLeave">
    <BookmarkDialog v-if="bookmarkDialog" :bookmark="editing" :categories="[{ id: snapshot.rootId!, title: 'Главная', index: -1 }, ...snapshot.categories.filter(row => !row.virtual)]" :busy="disabled" :error="dialogError" @close="bookmarkDialog = false" @save="saveBookmark" />
    </Transition>
    <Transition enter-active-class="transition-opacity duration-250 motion-reduce:transition-none" leave-active-class="transition-opacity duration-250 motion-reduce:transition-none" enter-from-class="opacity-0" leave-to-class="opacity-0" :duration="250" @before-leave="beforeDialogLeave">
    <ImportExportDialog v-if="transfer" :mode="transfer" :value="exportText" :busy="disabled" :operation-error="importError" @close="transfer = undefined" @import="importData" />
    </Transition>
    <ContextMenu v-if="context" :x="context.x" :y="context.y" :bookmark="context.bookmark" :category="context.category" @close="context = undefined" @action="action" />
  </div>
</template>
