<script setup lang="ts">
import {
  t,
  formatMessage,
  joinMessages,
  message,
  LocalizedError,
  errorMessage,
  type MessageText,
} from './services/i18n';
import { ref, shallowRef, computed, watch, nextTick, onUnmounted } from 'vue';
import { browser } from 'wxt/browser';
import FolderTabs from './components/FolderTabs.vue';
import FolderDialog from './components/FolderDialog.vue';
import BookmarkGrid from './components/BookmarkGrid.vue';
import { useBookmarkEdges } from './composables/useBookmarkEdges';
import { useTheme } from './composables/useTheme';
import { useBookmarkSearch } from './composables/useBookmarkSearch';
import BookmarkDialog from './components/BookmarkDialog.vue';
import SearchBar from './components/SearchBar.vue';
import EmptyState from './components/EmptyState.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import MailIndicators from './components/MailIndicators.vue';
import WeatherWidget from './components/WeatherWidget.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import ContextMenu from './components/ContextMenu.vue';
import type DataManagementDialogComponent from './modules/dial/modules/backup/components/DataManagementDialog.vue';
const DataManagementDialog = shallowRef<typeof DataManagementDialogComponent>();
import { useDial } from './composables/useDial';
import { useServices } from './app/serviceContext';
import { prepareCapture } from './modules/dial/modules/capture/prepare';
import { normalizeUrl } from './services/validation';
import { cacheBackgroundPreview, clearBackgroundPreview } from './utils/backgroundPreview';
import { BackgroundResource } from './utils/backgroundResource';
import { insertedOrder } from './utils/reorder';
import { contextKey } from './utils/keyboard';
import type {
  BackupSelection,
  Bookmark,
  Folder,
  ImportData,
  ImportReport,
  PreparedExport,
  Settings,
} from './types/models';

const services = useServices();
const { repository, lock: withDataLock } = services;
const {
  snapshot,
  loading,
  settingsReady,
  busy,
  notice,
  run,
  refresh,
  announce,
  revision,
  changeSearchProvider,
  updateSettings,
  changeRoot,
  changeBackground,
  flushSettings,
  settingErrors,
} = useDial(services);
useTheme(
  () => snapshot.value.settings.theme,
  () => settingsReady.value,
);
const {
  query,
  results,
  pending: searchPending,
  error: searchError,
} = useBookmarkSearch(repository, snapshot, revision);
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion:reduce)');
const reducedMotion = ref(reducedMotionQuery.matches);
const motionEnabled = computed(() => !reducedMotion.value);
function motionPreferenceChanged(event: MediaQueryListEvent) {
  reducedMotion.value = event.matches;
}
reducedMotionQuery.addEventListener('change', motionPreferenceChanged);
onUnmounted(() => reducedMotionQuery.removeEventListener('change', motionPreferenceChanged));
const keyboardFocus = ref(true);
function trackKeyboardFocus(event: KeyboardEvent) {
  if (
    !event.isComposing &&
    [
      'Tab',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
      'F10',
      'ContextMenu',
    ].includes(event.key)
  )
    keyboardFocus.value = true;
}
function trackPointerFocus() {
  keyboardFocus.value = false;
}
window.addEventListener('keydown', trackKeyboardFocus, true);
window.addEventListener('pointerdown', trackPointerFocus, true);
onUnmounted(() => {
  window.removeEventListener('keydown', trackKeyboardFocus, true);
  window.removeEventListener('pointerdown', trackPointerFocus, true);
});
const searchText = ref('');
const bookmarkContent = ref<HTMLElement>();
useBookmarkEdges(bookmarkContent);
const searchControl = ref<InstanceType<typeof SearchBar>>();
const bookmarkMode = computed(
  () =>
    snapshot.value.settings.bookmarkSearch &&
    snapshot.value.settings.searchProvider === 'bookmarks',
);
watch(
  [searchText, bookmarkMode],
  () => {
    query.value = bookmarkMode.value ? searchText.value : '';
  },
  { flush: 'sync' },
);
watch(
  [() => snapshot.value.settings.bookmarkSearch, bookmarkMode],
  ([enabled], previous) => {
    if (!enabled && previous?.[1]) searchText.value = '';
  },
  { flush: 'sync' },
);
const searching = computed(() => bookmarkMode.value && !!query.value.trim());
const folderNames = computed(() =>
  Object.fromEntries(snapshot.value.folders.map((row) => [row.id, row.title])),
);
const showEmptySearch = ref(false);
let emptySearchTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  [query, bookmarkMode, searchPending, searchError, results],
  () => {
    clearTimeout(emptySearchTimer);
    showEmptySearch.value = false;
    if (searching.value && !searchPending.value && !searchError.value && !results.value.length)
      emptySearchTimer = setTimeout(() => {
        showEmptySearch.value = true;
      }, 400);
  },
  { flush: 'sync' },
);
onUnmounted(() => clearTimeout(emptySearchTimer));
function openSearch() {
  void searchControl.value?.openBookmarks();
}
watch(
  [() => snapshot.value.activeId, query],
  () => bookmarkContent.value?.scrollTo({ top: 0, behavior: 'instant' }),
  { flush: 'post' },
);
function closeSearch() {
  searchText.value = '';
}
function focusSearchResult() {
  document.querySelector<HTMLElement>('.bookmark')?.focus();
}
const capturing = ref(false);
const savingBookmark = ref(false);
const folderDialogError = ref<MessageText>('');
const creatingFolder = ref(false);
const editingFolder = shallowRef<{ id: string; title: string }>();

watch(
  () => snapshot.value.rootId,
  () => {
    creatingFolder.value = false;
    editingFolder.value = undefined;
  },
);
const disabled = computed(
  () => loading.value || busy.value || capturing.value || savingBookmark.value,
);
const settingsOpen = ref(false);
const openingData = ref(false);
const settingsPanel = ref<InstanceType<typeof SettingsPanel>>();
let settingsGeneration = 0;
async function closeSettings() {
  if (!settingsOpen.value) return;
  const generation = settingsGeneration;
  await settingsPanel.value?.flush();
  await flushSettings();
  if (generation === settingsGeneration) settingsOpen.value = false;
}
function openSettings() {
  settingsGeneration++;
  settingsOpen.value = true;
}
const bookmarkDialog = ref(false);
const editing = shallowRef<Bookmark>();
const dialogError = ref<MessageText>('');
const folderError = ref<MessageText>('');
const dialogFolders = ref<Folder[]>([]);
async function openBookmark(bookmark?: Bookmark) {
  if (disabled.value) return;
  try {
    const root = await repository.rootNode();
    const [choices, children] = await Promise.all([
      repository.choices(),
      repository.bookmarks.getChildren(root.id),
    ]);
    const choiceIds = new Set(choices.map((choice) => choice.id));
    dialogFolders.value = [
      { id: root.id, title: root.title, index: -1 },
      ...children
        .filter((row) => !row.url && choiceIds.has(row.id))
        .map((row) => ({ id: row.id, title: row.title, index: row.index ?? 0 })),
    ];
    editing.value = bookmark
      ? ({ ...bookmark, ...(await repository.bookmark(bookmark.id)) } as Bookmark)
      : undefined;
    dialogError.value = '';
    folderError.value = '';
    bookmarkDialog.value = true;
  } catch (error) {
    notice.value = fail(error);
  }
}

const mailRevision = ref(0);
const dataOpen = ref(false);
const dataDialog = ref<InstanceType<typeof DataManagementDialogComponent>>();
const confirmation = shallowRef<{
  title: MessageText;
  message: MessageText;
  perform: () => Promise<boolean>;
  actionLabel: MessageText;
  destructive: boolean;
}>();
const confirmationBusy = ref(false),
  confirmationError = ref<MessageText>('');
function askConfirmation(
  title: MessageText,
  description: MessageText,
  perform: () => Promise<boolean>,
  actionLabel: MessageText = message('common.delete'),
  destructive = true,
) {
  if (confirmation.value || disabled.value) return;
  confirmationError.value = '';
  confirmation.value = { title, message: description, perform, actionLabel, destructive };
}
function closeConfirmation() {
  if (!confirmationBusy.value) confirmation.value = undefined;
}
async function confirmAction() {
  const current = confirmation.value;
  if (!current || confirmationBusy.value) return;
  confirmationBusy.value = true;
  confirmationError.value = '';
  try {
    if (await current.perform()) confirmation.value = undefined;
    else confirmationError.value = notice.value || message('errors.action_failed');
  } catch (error) {
    confirmationError.value = errorMessage(error);
  } finally {
    confirmationBusy.value = false;
  }
}
const overlayOpen = computed(
  () =>
    !!confirmation.value ||
    settingsOpen.value ||
    openingData.value ||
    bookmarkDialog.value ||
    dataOpen.value ||
    creatingFolder.value ||
    !!editingFolder.value,
);

const context = shallowRef<{ x: number; y: number; bookmark?: Bookmark; folder?: Folder }>();
const backgroundUrl = ref('');
let decodedBackground: { url: string; image: HTMLImageElement } | undefined;
const backgroundResource = new BackgroundResource(
  async (url) => {
    backgroundUrl.value = url;
    if (url && decodedBackground?.url === url) cacheBackgroundPreview(decodedBackground.image);
    else if (!url) clearBackgroundPreview();
    decodedBackground = undefined;
    await nextTick();
  },
  async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    decodedBackground = { url, image };
  },
);
watch([() => snapshot.value.background, loading], ([blob, isLoading]) => {
  if (!blob && isLoading) return;
  if (!blob) clearBackgroundPreview();
  void backgroundResource.replace(blob).catch((error) => {
    notice.value = message('background.errors.display_failed', { error: errorMessage(error) });
  });
});
onUnmounted(() => backgroundResource.dispose());
const fail = (error: unknown) => errorMessage(error);
function add() {
  void openBookmark();
}
function showContext(event: MouseEvent | KeyboardEvent, bookmark?: Bookmark) {
  if (
    (event.target as HTMLElement).closest('input,textarea,button,dialog') ||
    disabled.value ||
    overlayOpen.value
  )
    return;
  event.preventDefault();
  rememberContextTarget(
    event.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement,
  );
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  context.value = {
    x: event instanceof MouseEvent ? event.clientX : bounds.left,
    y: event instanceof MouseEvent ? event.clientY : bounds.bottom,
    bookmark,
  };
}
function showFolderContext(event: MouseEvent | KeyboardEvent, folder: Folder) {
  if (folder.virtual || disabled.value || overlayOpen.value) return;
  rememberContextTarget(event.currentTarget as HTMLElement);
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  context.value = {
    x: event instanceof MouseEvent ? event.clientX : bounds.left,
    y: event instanceof MouseEvent ? event.clientY : bounds.bottom,
    folder,
  };
}
async function saveBookmark(value: {
  url: string;
  title: string;
  capture: boolean;
  parentId?: string;
  titleEdited: boolean;
}) {
  if (disabled.value) return;
  savingBookmark.value = true;
  dialogError.value = '';
  folderError.value = '';
  try {
    const url = normalizeUrl(value.url);
    try {
      await repository.parent(value.parentId);
    } catch (error) {
      folderError.value = fail(error);
      return;
    }
    const selected = editing.value;
    const idResult = { id: selected?.id ?? '' };
    let capture = !selected && value.capture;
    if (
      !(await run(async () => {
        if (selected)
          capture = await repository.edit(
            selected.id,
            url,
            value.title,
            value.parentId,
            value.titleEdited,
            selected,
          );
        else
          idResult.id = await repository.add({ url, title: value.title, parentId: value.parentId });
      }))
    ) {
      dialogError.value = notice.value;
      return;
    }
    bookmarkDialog.value = false;
    if (capture) {
      capturing.value = true;
      try {
        await updateImages(idResult.id, url);
      } catch (error) {
        notice.value = message('bookmarks.notices.saved_with_warning', { error: fail(error) });
      } finally {
        capturing.value = false;
      }
    }
  } catch (error) {
    dialogError.value = fail(error);
  } finally {
    savingBookmark.value = false;
  }
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
      if (ids)
        await run(() => {
          if (moveRevision !== revision.value)
            throw new LocalizedError(message('bookmarks.errors.list_changed_before_move'));
          return folder
            ? repository.reorderFolders(ids, moveExpected)
            : repository.reorder(ids, moveExpected, selected!.parentId);
        });
      return;
    }
    if (folder && name !== 'folder') {
      if (name === 'edit' || name === 'delete')
        await folderAction(name === 'edit' ? 'rename' : 'delete', folder.id);
      return;
    }
    if (name === 'add') await openBookmark();
    if (name === 'folder') await folderAction('create');
    if (name === 'settings') openSettings();
    if (!selected) return;
    if (name === 'open') await browser.tabs.create({ url: selected.url });
    if (name === 'edit') await openBookmark(selected);
    if (name === 'delete')
      askConfirmation(
        message('bookmarks.delete.title'),
        message('bookmarks.delete.description', { bookmark_name: selected.title }),
        () => run(() => repository.remove(selected.id)),
      );
    if (name === 'thumbnail') {
      notice.value = message('thumbnails.status.opening_website');
      capturing.value = true;
      try {
        await updateImages(selected.id, selected.url);
        notice.value = message('thumbnails.status.updated');
      } finally {
        capturing.value = false;
      }
    }
  } catch (error) {
    notice.value = fail(error);
  } finally {
    if (!overlayOpen.value) restorePageFocus(returnTarget);
  }
}
const dataChoices = () => repository.choices();
async function prepareBackup(): Promise<PreparedExport> {
  await flushSettings();
  const warnings: MessageText[] = [];
  const data = await withDataLock(() => repository.exportData((message) => warnings.push(message)));
  return { data, warnings };
}
async function exportBackup(selection: BackupSelection, prepared: PreparedExport) {
  const { selectExport, serializeExport } = await services.getBackup();
  const warnings = selection.bookmarks || selection.images ? [...prepared.warnings] : [];
  const text = await withDataLock(() =>
    serializeExport(selectExport(prepared.data, selection), (message) => warnings.push(message)),
  );
  return { text, warnings };
}
async function importBackup(
  data: ImportData,
  id: string,
  expected: Settings,
  selection: BackupSelection,
): Promise<ImportReport> {
  let report: ImportReport | undefined;
  if (
    !(await run(async () => {
      report = await repository.importData(data, id, expected, selection);
    }, true))
  )
    throw new LocalizedError(notice.value || message('backup.import.errors.start_failed'));
  mailRevision.value++;
  return report!;
}
async function resetData() {
  if (!(await run(() => repository.reset(), true)))
    throw new LocalizedError(notice.value || message('backup.reset.errors.finish_failed'));
}
function reorder(ids: string[], expected: string[], dragRevision: number) {
  const parent = snapshot.value.activeId;
  if (!searching.value)
    void run(() => {
      if (dragRevision !== revision.value)
        throw new LocalizedError(message('bookmarks.errors.list_changed_before_drop'));
      return repository.reorder(ids, expected, parent);
    });
}
async function updateImages(id: string, url: string) {
  const prepared = await prepareCapture(
    repository,
    id,
    url,
    (message) => new LocalizedError(message),
  );
  let capture: Awaited<ReturnType<typeof services.getCapture>>;
  try {
    capture = await services.getCapture();
  } catch {
    throw new LocalizedError(message('capture.errors.background_interrupted'));
  }
  await capture.updateImages(id, url, prepared, { refresh, announce });
}
async function selectFolder(id: string) {
  if (bookmarkMode.value) closeSearch();
  repository.selectFolder(id);
  try {
    await refresh();
  } catch (error) {
    notice.value = fail(error);
  }
}
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
  folderDialogError.value = '';
  if (
    await run(() =>
      selected ? repository.renameFolder(selected.id, title) : repository.createFolder(title),
    )
  )
    await cancelFolder();
  else {
    folderDialogError.value = notice.value;
    notice.value = '';
  }
}
async function folderAction(name: 'create' | 'rename' | 'delete', id = snapshot.value.activeId) {
  if (name === 'create') {
    await beginFolder();
    return;
  }
  if (!id || id === snapshot.value.rootId) return;
  if (name === 'rename') {
    if (disabled.value) return;
    const folder = await repository.folder(id);
    creatingFolder.value = false;
    folderDialogError.value = '';
    editingFolder.value = { id, title: folder.title };
  }
  if (name === 'delete') {
    const folder = await repository.folder(id);
    askConfirmation(
      message('folders.delete.title'),
      message('folders.delete.description', { folder_name: folder.title }),
      () => run(() => repository.removeFolder(id)),
    );
  }
}
async function reorderFolders(ids: string[], expected: string[], dragRevision: number) {
  await run(() => {
    if (dragRevision !== revision.value)
      throw new LocalizedError(message('bookmarks.errors.list_changed_before_drop'));
    return repository.reorderFolders(ids, expected);
  });
}
type FocusTarget = { element: HTMLElement; selector?: string; id?: string; index: number };
function focusTarget(element: Element | null): FocusTarget | undefined {
  if (!(element instanceof HTMLElement) || element === document.body || element.tabIndex < 0)
    return;
  const selector = element.matches('.bookmark')
    ? '.bookmark'
    : element.matches('[data-folder-id]')
      ? '[data-folder-id]'
      : undefined;
  return {
    element,
    selector,
    id: element.dataset.bookmarkId ?? element.dataset.folderId,
    index: selector ? Array.from(document.querySelectorAll(selector)).indexOf(element) : 0,
  };
}
function restorePageFocus(target?: FocusTarget) {
  if (overlayOpen.value || context.value) return;
  const candidates = target?.selector
    ? Array.from(document.querySelectorAll<HTMLElement>(target.selector))
    : [];
  const same = candidates.find(
    (el) => (el.dataset.bookmarkId ?? el.dataset.folderId) === target?.id,
  );
  const element =
    same ??
    (target?.element.isConnected
      ? target.element
      : candidates[Math.min(target?.index ?? 0, candidates.length - 1)]);
  const usable = (el?: HTMLElement | null) =>
    !!el &&
    el.isConnected &&
    !el.closest('[inert],[aria-hidden="true"]') &&
    !el.matches(':disabled') &&
    el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== 'hidden';
  const fallbacks = target?.selector
    ? [
        '.add-card:not(:disabled)',
        '.search input:not(:disabled)',
        '.folder-root:not(:disabled)',
        '.settings-trigger:not(:disabled)',
      ]
    : ['.settings-trigger:not(:disabled)'];
  const fallback = fallbacks
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .find((el) => usable(el));
  if (usable(element)) element!.focus({ preventScroll: true });
  else if (usable(fallback)) fallback!.focus({ preventScroll: true });
}
let contextTarget: FocusTarget | undefined;
function rememberContextTarget(element: Element | null = document.activeElement) {
  contextTarget = focusTarget(element);
}
function closeContext() {
  context.value = undefined;
  restorePageFocus(contextTarget);
}
const contextOrder = computed(() =>
  context.value?.folder
    ? snapshot.value.folders.filter((row) => !row.virtual).map((row) => row.id)
    : snapshot.value.tabs.map((row) => row.id),
);
function canMove(direction: number) {
  const id = context.value?.folder?.id ?? context.value?.bookmark?.id;
  const index = id ? contextOrder.value.indexOf(id) : -1;
  return (
    !disabled.value &&
    !(context.value?.bookmark && searching.value) &&
    index >= 0 &&
    index + direction >= 0 &&
    index + direction < contextOrder.value.length
  );
}
// Capture focus before Vue removes a node. Restore only if that update lost it;
// typing, pointer focus and a newly opened overlay always take precedence.
watch(
  [snapshot, results, disabled],
  async () => {
    const previous = focusTarget(document.activeElement);
    await nextTick();
    if (!previous || overlayOpen.value || context.value) return;
    const active = document.activeElement;
    if (
      active === document.body ||
      (active === previous.element &&
        (!previous.element.isConnected || previous.element.closest('[inert]')))
    )
      restorePageFocus(previous);
  },
  { flush: 'pre' },
);
const dialogReturnTargets = new WeakMap<Element, FocusTarget>();
function beforeDialogEnter(element: Element) {
  if (document.activeElement instanceof HTMLElement)
    dialogReturnTargets.set(element, focusTarget(document.activeElement)!);
}
function restoreDialogFocus(element: Element) {
  const previous = dialogReturnTargets.get(element);
  dialogReturnTargets.delete(element);
  if (overlayOpen.value || context.value) return;
  restorePageFocus(previous);
}
function restoreConfirmationFocus(element: Element) {
  const previous = dialogReturnTargets.get(element);
  dialogReturnTargets.delete(element);
  if (
    previous?.element.isConnected &&
    previous.element.closest('dialog[open]:not([inert])') &&
    !previous.element.matches(':disabled')
  )
    previous.element.focus({ preventScroll: true });
  else restorePageFocus(previous);
}
const loadingDataUI = ref(false);
let isDisposed = false;
onUnmounted(() => {
  isDisposed = true;
});
async function openDataManagement() {
  if (disabled.value || !settingsOpen.value || openingData.value || loadingDataUI.value) return;
  loadingDataUI.value = true;
  try {
    const backup = await services.getBackup();
    if (isDisposed || !settingsOpen.value) return;
    DataManagementDialog.value = backup.Dialog;
    openingData.value = true;
    settingsOpen.value = false;
  } catch {
    if (!isDisposed) notice.value = message('backup.errors.load_failed');
  } finally {
    loadingDataUI.value = false;
  }
}
function afterSettingsLeave(element: Element) {
  if (openingData.value) {
    dialogReturnTargets.delete(element);
    dataOpen.value = true;
    openingData.value = false;
  } else restoreDialogFocus(element);
}
function beforeDialogLeave(element: Element) {
  (element as HTMLElement).inert = true;
}
function escape(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === 'Escape' && openingData.value) {
    event.preventDefault();
    openingData.value = false;
    return;
  }
  if (
    contextKey(event) &&
    !overlayOpen.value &&
    !context.value &&
    !disabled.value &&
    !(event.target as HTMLElement).closest('input,textarea,select,[contenteditable],dialog')
  ) {
    event.preventDefault();
    rememberContextTarget(document.activeElement);
    context.value = { x: 24, y: 100 };
    return;
  }
  if (
    event.key === '/' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !disabled.value &&
    snapshot.value.settings.bookmarkSearch &&
    snapshot.value.rootId &&
    !overlayOpen.value &&
    !context.value &&
    !(event.target as HTMLElement).closest(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog,[role="dialog"]',
    )
  ) {
    event.preventDefault();
    openSearch();
    return;
  }
  if (event.key === 'Escape' && dataOpen.value) {
    event.preventDefault();
    dataDialog.value?.close();
    return;
  }
  if (
    event.key !== 'Escape' ||
    disabled.value ||
    event.defaultPrevented ||
    (event.target instanceof Element && event.target.closest('dialog'))
  )
    return;
  if (searching.value && !overlayOpen.value && !context.value) {
    event.preventDefault();
    closeSearch();
    return;
  }
  if (context.value) closeContext();
  else void closeSettings();
}
window.addEventListener('keydown', escape);
onUnmounted(() => window.removeEventListener('keydown', escape));
</script>
<template>
  <div
    :data-keyboard-focus="keyboardFocus || undefined"
    class="page relative font-[family-name:var(--ui-font)] leading-[normal] bg-center bg-cover bg-no-repeat [:where(&)_button]:cursor-pointer [&_button:disabled]:cursor-default [&_button:disabled]:opacity-100 [:where(&)_button]:font-[family-name:var(--ui-font)] [:where(&)_input]:font-[family-name:var(--ui-font)] [:where(&)_textarea]:font-[family-name:var(--ui-font)] [:where(&)_button]:text-base [:where(&)_input]:text-base [:where(&)_textarea]:text-base [:where(&)_button]:font-normal [:where(&)_button]:leading-[normal] [:where(&)_input]:leading-[normal] [:where(&)_textarea]:leading-[normal] [:where(&)_button]:[-webkit-tap-highlight-color:transparent] [&_a]:[-webkit-tap-highlight-color:transparent] [:where(&)_input]:[-webkit-tap-highlight-color:transparent] [:where(&)_textarea]:[-webkit-tap-highlight-color:transparent] [&_input::placeholder]:opacity-100 [&_textarea::placeholder]:opacity-100 [&_*]:motion-reduce:transition-none [&_*]:motion-reduce:animate-none [&_*::before]:motion-reduce:transition-none [&_*::after]:motion-reduce:transition-none"
    @contextmenu="showContext"
  >
    <div
      aria-hidden="true"
      class="page-background fixed inset-0 pointer-events-none bg-center bg-cover bg-no-repeat"
      :class="{ 'is-ready': !!backgroundUrl }"
      :style="{
        backgroundImage: backgroundUrl
          ? 'linear-gradient(var(--wallpaper-shade),var(--wallpaper-shade)),url(' +
            backgroundUrl +
            ')'
          : undefined,
        backgroundColor: backgroundUrl ? '#808590' : undefined,
      }"
    />
    <main
      class="dial relative flex flex-col p-6 motion-reduce:transition-none [&.pushed]:pointer-events-none"
      :class="{ pushed: settingsOpen, 'is-loaded': !loading }"
    >
      <header
        class="relative shrink-0"
        :class="{
          'has-weather': snapshot.settings.weatherEnabled,
          'has-mail-services':
            snapshot.settings.gmailEnabled || snapshot.settings.yandexMailEnabled,
        }"
      >
        <SearchBar
          ref="searchControl"
          v-model="searchText"
          :bookmark-search="snapshot.settings.bookmarkSearch"
          :movie-search="snapshot.settings.movieSearch"
          @submit-bookmarks="focusSearchResult"
          :provider="snapshot.settings.searchProvider"
          :disabled="disabled"
          :save-provider="changeSearchProvider"
        />
        <div class="tools flex items-center gap-2">
          <WeatherWidget
            v-if="snapshot.settings.weatherEnabled"
            :city="snapshot.settings.weatherCity"
            :provider="snapshot.settings.weatherProvider"
          />
          <MailIndicators :key="mailRevision" :settings="snapshot.settings" />
          <button
            class="settings-trigger ui-folder inline-flex size-12 items-center justify-center"
            :aria-label="t('settings.title')"
            :title="t('settings.title')"
            aria-haspopup="dialog"
            :aria-expanded="settingsOpen"
            :aria-controls="settingsOpen ? 'settings-modal' : undefined"
            :disabled="disabled"
            @click="openSettings"
          >
            <svg
              class="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <g transform="translate(0 1)">
                <path d="m9 3-1 3-3 1-2 4 2 2v3l4 3 3-1 3 1 4-3v-3l2-2-2-4-3-1-1-3Z" />
                <circle cx="12" cy="11" r="3" />
              </g>
            </svg>
          </button>
        </div>
      </header>
      <div class="bookmark-area flex flex-col flex-1">
        <div v-if="!loading && !snapshot.rootId" class="surface-empty text-center my-8">
          <p>{{ t('bookmarks.source.choose_in_settings') }}</p>
          <button class="mt-3" :disabled="disabled" @click="openSettings">
            {{ t('settings.open') }}
          </button>
        </div>
        <template v-else-if="!loading">
          <div
            v-if="snapshot.folders.length || creatingFolder"
            class="bookmark-toolbar relative flex items-center min-h-12 my-4 mx-auto"
            :style="{ width: snapshot.settings.width + '%' }"
          >
            <FolderTabs
              :context-id="context ? contextTarget?.id : undefined"
              :motion-enabled="motionEnabled"
              :revision="revision"
              :folders="snapshot.folders"
              :active-id="snapshot.activeId"
              :disabled="disabled"
              :creating="creatingFolder"
              :editing="editingFolder"
              @select="selectFolder"
              @context="showFolderContext"
              @background="
                (event) => {
                  if (!disabled && !overlayOpen) {
                    rememberContextTarget();
                    context = { x: event.clientX, y: event.clientY };
                  }
                }
              "
              @reorder="reorderFolders"
              @refresh="refresh"
            />
          </div>
          <div
            ref="bookmarkContent"
            class="bookmark-content flex flex-col flex-1"
            :class="{ 'justify-center': snapshot.settings.verticalCenter }"
          >
            <p v-if="searching && searchError" role="alert" class="surface-empty text-center my-4">
              {{ formatMessage(searchError) }}
              <button @click.stop="revision++">{{ t('common.retry') }}</button>
            </p>
            <EmptyState
              v-else-if="showEmptySearch"
              class="bookmark-search-empty my-6"
              :title="t('search.bookmarks.empty.title')"
              :description="t('search.bookmarks.empty.description')"
              :action-label="t('search.clear')"
              symbol="search"
              announce
              :disabled="disabled"
              @action="
                closeSearch();
                searchControl?.focus();
              "
              :style="{ width: 'min(440px,' + snapshot.settings.width + '%)' }"
            />
            <BookmarkGrid
              :context-id="context ? contextTarget?.id : undefined"
              :motion-enabled="motionEnabled"
              :folder-id="snapshot.activeId"
              :revision="revision"
              :folder-names="folderNames"
              :tabs="searching ? results : snapshot.tabs"
              :searching="searching"
              :settings="snapshot.settings"
              :disabled="disabled"
              @add="add"
              @context="showContext"
              @reorder="reorder"
              @refresh="refresh"
            />
          </div>
        </template>
      </div>
    </main>
    <div
      v-if="!settingsOpen && Object.keys(settingErrors).length"
      role="alert"
      class="fixed bottom-4 left-4 right-4 p-4 rounded-[var(--ui-radius)] shadow-[var(--ui-shadow-popover)] z-50 break-words"
    >
      {{ formatMessage(joinMessages(Object.values(settingErrors))) }}
    </div>
    <div
      v-if="notice && !settingsOpen"
      role="status"
      class="notice fixed bottom-4 left-4 right-4 p-4 rounded-[var(--ui-radius)] shadow-[var(--ui-shadow-popover)] flex justify-between items-start gap-3 z-50 [overflow-wrap:anywhere]"
    >
      <span>{{ formatMessage(notice) }}</span
      ><button
        class="ui-hover rounded-full"
        :aria-label="t('notifications.dismiss')"
        @click="notice = ''"
      >
        ×
      </button>
    </div>
    <Transition
      name="settings-panel"
      :duration="motionEnabled ? 250 : 0"
      @before-leave="beforeDialogLeave"
      @after-leave="afterSettingsLeave"
      @before-enter="beforeDialogEnter"
    >
      <SettingsPanel
        v-if="settingsOpen"
        ref="settingsPanel"
        :settings="snapshot.settings"
        :root-id="snapshot.rootId"
        :operation-error="formatMessage(joinMessages(Object.values(settingErrors)))"
        :busy="disabled"
        :has-background="!!snapshot.background"
        :update-settings="updateSettings"
        :change-root="changeRoot"
        :change-background="changeBackground"
        @close="closeSettings"
        @manage="openDataManagement"
        @error="notice = $event"
      />
    </Transition>
    <Transition
      name="modal-panel"
      :duration="motionEnabled ? 250 : 0"
      @before-enter="beforeDialogEnter"
      @before-leave="beforeDialogLeave"
      @after-leave="restoreDialogFocus"
    >
      <FolderDialog
        v-if="creatingFolder || editingFolder"
        :title="editingFolder?.title"
        :busy="disabled"
        :error="folderDialogError"
        @close="cancelFolder"
        @save="saveFolder"
      />
    </Transition>
    <Transition
      name="modal-panel"
      :duration="motionEnabled ? 250 : 0"
      @before-enter="beforeDialogEnter"
      @before-leave="beforeDialogLeave"
      @after-leave="restoreDialogFocus"
    >
      <BookmarkDialog
        v-if="bookmarkDialog"
        :bookmark="editing"
        :folders="dialogFolders"
        :active-id="snapshot.activeId"
        :folder-error="folderError"
        :busy="disabled"
        :error="dialogError"
        @close="bookmarkDialog = false"
        @save="saveBookmark"
      />
    </Transition>
    <Transition
      name="modal-panel"
      :duration="motionEnabled ? 250 : 0"
      @before-enter="beforeDialogEnter"
      @before-leave="beforeDialogLeave"
      @after-leave="restoreDialogFocus"
    >
      <DataManagementDialog
        v-if="dataOpen"
        ref="dataDialog"
        :root-id="snapshot.rootId"
        :settings="snapshot.settings"
        :choices="dataChoices"
        :prepare-export="prepareBackup"
        :export-data="exportBackup"
        :import-data="importBackup"
        :reset-data="resetData"
        @close="dataOpen = false"
      />
    </Transition>
    <Transition
      name="modal-panel"
      :duration="motionEnabled ? 250 : 0"
      @before-enter="beforeDialogEnter"
      @before-leave="beforeDialogLeave"
      @after-leave="restoreConfirmationFocus"
    >
      <ConfirmDialog
        v-if="confirmation"
        :title="confirmation.title"
        :message="confirmation.message"
        :action-label="confirmation.actionLabel"
        :destructive="confirmation.destructive"
        :busy="confirmationBusy"
        :error="confirmationError"
        @close="closeConfirmation"
        @confirm="confirmAction"
      />
    </Transition>
    <Transition
      name="floating"
      :duration="motionEnabled ? 150 : 0"
      @before-enter="
        (element) => {
          (element as HTMLElement).inert = false;
          element.removeAttribute('aria-hidden');
        }
      "
      @before-leave="
        (element) => {
          beforeDialogLeave(element);
          element.setAttribute('aria-hidden', 'true');
        }
      "
    >
      <ContextMenu
        v-if="context"
        :x="context.x"
        :y="context.y"
        :bookmark="context.bookmark"
        :folder="context.folder"
        :can-move-left="canMove(-1)"
        :can-move-right="canMove(1)"
        @close="closeContext"
        @action="action"
      />
    </Transition>
  </div>
</template>
