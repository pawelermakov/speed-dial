<script setup lang="ts">
import { ref, shallowRef, computed, watch, onUnmounted } from 'vue';
import { browser } from 'wxt/browser';
import BookmarkGrid from './components/BookmarkGrid.vue';
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
import type { Bookmark, Settings } from './types/models';

const { snapshot, loading, busy, notice, run } = useDial();
const capturing = ref(false);
const disabled = computed(() => loading.value || busy.value || capturing.value);
const settingsOpen = ref(false);
const bookmarkDialog = ref(false);
const editing = shallowRef<Bookmark>();
const dialogError = ref('');
const importError = ref('');
const mailRevision = ref(0);
const transfer = ref<'import' | 'export'>();
const exportText = ref('');
const context = shallowRef<{ x: number; y: number; bookmark?: Bookmark }>();
const backgroundUrl = ref('');
watch(() => snapshot.value.background, blob => {
  if (backgroundUrl.value) URL.revokeObjectURL(backgroundUrl.value);
  backgroundUrl.value = blob ? URL.createObjectURL(blob) : '';
});
onUnmounted(() => { if (backgroundUrl.value) URL.revokeObjectURL(backgroundUrl.value); });
const fail = (error: unknown) => error instanceof Error ? error.message : String(error);
function add() { if (disabled.value) return; editing.value = undefined; dialogError.value = ''; bookmarkDialog.value = true; }
function showContext(event: MouseEvent, bookmark?: Bookmark) {
  if ((event.target as HTMLElement).closest('input,textarea,button,dialog') || disabled.value || settingsOpen.value || bookmarkDialog.value || transfer.value) return;
  event.preventDefault();
  context.value = { x: event.clientX, y: event.clientY, bookmark };
}
async function saveBookmark(value: { url: string; title: string; capture: boolean }) {
  if (disabled.value) return;
  dialogError.value = '';
  try {
    const url = normalizeUrl(value.url);
    const selected = editing.value;
    if (selected) {
      if (await run(() => repository.edit(selected.id, url, value.title))) bookmarkDialog.value = false;
      else dialogError.value = notice.value;
      return;
    }
    let metadata = { title: new URL(url).hostname, favicon: '', thumbnail: null as Blob | null };
    if (value.capture) {
      capturing.value = true;
      try { metadata = await requestThumbnail(url); }
      finally { capturing.value = false; }
    }
    if (await run(() => repository.add({ url, ...metadata }))) bookmarkDialog.value = false;
    else dialogError.value = notice.value;
  } catch (error) { dialogError.value = fail(error); }
}
async function action(name: string) {
  const selected = context.value?.bookmark;
  context.value = undefined;
  try {
    if (name === 'add') add();
    if (name === 'settings') settingsOpen.value = true;
    if (!selected) return;
    if (name === 'open') await browser.tabs.create({ url: selected.url });
    if (name === 'edit') { editing.value = selected; dialogError.value = ''; bookmarkDialog.value = true; }
    if (name === 'delete' && confirm('Вы действительно хотите удалить закладку?'))
      await run(() => repository.remove(selected.id));
    if (name === 'thumbnail') {
      notice.value = 'Сайт временно откроется для обновления эскиза…';
      capturing.value = true;
      try {
        const result = await requestThumbnail(selected.url);
        capturing.value = false;
        if (await run(() => repository.thumbnail(selected.id, selected.url, result.thumbnail, result.favicon))) notice.value = 'Эскиз обновлён.';
      } finally { capturing.value = false; }
    }
  } catch (error) { notice.value = fail(error); }
}
async function saveSettings(value: Settings, background?: Blob | null) {
  if (await run(() => repository.saveSettings(value, background))) { settingsOpen.value = false; mailRevision.value++; }
}
async function openExport() {
  if (disabled.value) return;
  try {
    if (await run(async () => { exportText.value = await serializeExport(await repository.load()); })) {
      settingsOpen.value = false; transfer.value = 'export';
    }
  } catch (error) { notice.value = fail(error); }
}
async function importData(text: string) {
  if (disabled.value) return;
  try {
    importError.value = '';
    const next = parseImport(text);
    if (!confirm('Импорт заменит все текущие закладки, настройки и фон. Продолжить?')) return;
    if (await run(() => repository.replace(next))) { transfer.value = undefined; mailRevision.value++; notice.value = 'Данные импортированы.'; }
    else importError.value = notice.value;
  } catch (error) { importError.value = fail(error); }
}
function reorder(ids: number[]) { void run(() => repository.reorder(ids)); }
async function reset() {
  if (confirm('Вы действительно хотите удалить все данные SpeedDial X?')) {
    if (await run(() => repository.reset())) { settingsOpen.value = false; notice.value = 'Данные удалены. Настройки восстановлены.'; }
  }
}
function beforeDialogLeave(element: Element) { (element as HTMLElement).inert = true; }
function escape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || disabled.value) return;
  context.value = undefined; settingsOpen.value = false;
}
window.addEventListener('keydown', escape);
onUnmounted(() => window.removeEventListener('keydown', escape));
</script>
<template>
  <div class="page font-[Helvetica,sans-serif] leading-[normal] min-h-screen min-h-screen bg-[#808590] bg-center bg-cover bg-no-repeat [&_*:focus]:outline-none [:where(&)_button]:cursor-pointer [&_button:disabled]:cursor-default [&_button:disabled]:opacity-100 [:where(&)_button]:font-[Helvetica,sans-serif] [:where(&)_input]:font-[Helvetica,sans-serif] [:where(&)_textarea]:font-[Helvetica,sans-serif] [:where(&)_button]:text-base [:where(&)_input]:text-base [:where(&)_textarea]:text-base [:where(&)_button]:font-normal [:where(&)_button]:leading-[normal] [:where(&)_input]:leading-[normal] [:where(&)_textarea]:leading-[normal] [:where(&)_button]:[-webkit-tap-highlight-color:transparent] [&_a]:[-webkit-tap-highlight-color:transparent] [:where(&)_input]:[-webkit-tap-highlight-color:transparent] [:where(&)_textarea]:[-webkit-tap-highlight-color:transparent] [&_input::placeholder]:text-[#757575] [&_textarea::placeholder]:text-[#757575] [&_input::placeholder]:opacity-100 [&_textarea::placeholder]:opacity-100 [&_button:focus-visible]:outline-1 [&_button:focus-visible]:outline-[#54565a] [&_button:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-1 [&_a:focus-visible]:outline-[#54565a] [&_a:focus-visible]:outline-offset-2 [&_*]:motion-reduce:transition-none [&_*]:motion-reduce:animate-none [&_*::before]:motion-reduce:transition-none [&_*::after]:motion-reduce:transition-none" :style="{ backgroundImage: backgroundUrl ? 'url(' + backgroundUrl + ')' : undefined }" @contextmenu="showContext">
    <main class="dial flex flex-col p-6 min-h-screen transition-all duration-250 ease-in-out motion-reduce:transition-none [&.pushed]:-translate-x-[300px] [&.pushed]:blur-[10px] [&.pushed]:pointer-events-none" :class="{ pushed: settingsOpen }">
      <header class="relative shrink-0">
        <SearchBar />
        <div class="tools flex items-center gap-4 absolute right-0 top-0 block">
          <MailIndicator :key="mailRevision" :email="snapshot.settings.email" />
          <button class="sr-only focus:not-sr-only" aria-label="Настройки" :disabled="disabled" @click="settingsOpen = true">Настройки</button>
        </div>
      </header>
      <div class="bookmark-area flex flex-col flex-1" :class="{ 'justify-center': snapshot.settings.verticalCenter }">
        <p v-if="loading" role="status" class="text-white text-center">Загрузка…</p>
        <BookmarkGrid v-else :tabs="snapshot.tabs" :settings="snapshot.settings" :disabled="disabled"
          @add="add" @context="showContext" @reorder="reorder" />
      </div>
    </main>
    <div v-if="notice" role="status" class="notice fixed bottom-4 left-4 right-4 p-4 rounded shadow-xl flex justify-between items-start gap-3 bg-[#fff8d6] z-50 [overflow-wrap:anywhere]">
      <span>{{ notice }}</span><button aria-label="Закрыть уведомление" @click="notice = ''">×</button>
    </div>
    <Transition leave-active-class="[&_.settings]:animate-none [&_.settings]:transition-transform [&_.settings]:duration-250 motion-reduce:[&_.settings]:transition-none" leave-to-class="[&_.settings]:translate-x-full" :duration="250" @before-leave="beforeDialogLeave">
    <SettingsPanel v-if="settingsOpen" :settings="snapshot.settings" :busy="disabled" @close="settingsOpen = false" @save="saveSettings"
      @import="settingsOpen = false; importError = ''; transfer = 'import'" @export="openExport" @reset="reset" />
    </Transition>
    <Transition enter-active-class="transition-opacity duration-250 motion-reduce:transition-none" leave-active-class="transition-opacity duration-250 motion-reduce:transition-none" enter-from-class="opacity-0" leave-to-class="opacity-0" :duration="250" @before-leave="beforeDialogLeave">
    <BookmarkDialog v-if="bookmarkDialog" :bookmark="editing" :busy="disabled" :error="dialogError" @close="bookmarkDialog = false" @save="saveBookmark" />
    </Transition>
    <Transition enter-active-class="transition-opacity duration-250 motion-reduce:transition-none" leave-active-class="transition-opacity duration-250 motion-reduce:transition-none" enter-from-class="opacity-0" leave-to-class="opacity-0" :duration="250" @before-leave="beforeDialogLeave">
    <ImportExportDialog v-if="transfer" :mode="transfer" :value="exportText" :busy="disabled" :operation-error="importError" @close="transfer = undefined" @import="importData" />
    </Transition>
    <ContextMenu v-if="context" :x="context.x" :y="context.y" :bookmark="context.bookmark" @close="context = undefined" @action="action" />
  </div>
</template>
