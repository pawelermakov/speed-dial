import { computed, shallowRef } from 'vue';
import { useServices } from './useServices';
import { useDial } from './useDial';
import { useTheme } from '../modules/appearance/composables';
import type { ContextState } from './screenTypes';
import { useSettingsPanel } from './useSettingsPanel';
import { useConfirmation } from './useConfirmation';
import { useBookmarkActions } from './useBookmarkActions';
import { useFolderActions } from './useFolderActions';
import { useBookmarkSearchView } from './useBookmarkSearchView';
import { usePagePresentation } from './usePagePresentation';
import { useScreenFocus } from './useScreenFocus';
import { useBackupFlow } from './useBackupFlow';
import { useContextActions } from './useContextActions';
import { usePageKeyboard } from './usePageKeyboard';
export function useNewtabScreen() {
  const services = useServices();
  const dial = useDial(services, services.translations);
  const { bookmarks: bookmarkModule, lock } = services;
  useTheme(
    () => dial.snapshot.value.settings.theme,
    () => dial.settingsReady.value,
  );
  const context = shallowRef<ContextState>();
  const disabled = computed(
    () =>
      dial.loading.value ||
      dial.busy.value ||
      bookmarks.capturing.value ||
      bookmarks.savingBookmark.value,
  );

  const settings = useSettingsPanel({ flushSettings: dial.flushSettings });
  const confirmation = useConfirmation({ disabled, notice: dial.notice });
  const search = useBookmarkSearchView({
    source: bookmarkModule.source,
    snapshot: dial.snapshot,
    revision: dial.revision,
  });
  const bookmarks = useBookmarkActions({
    source: bookmarkModule.source,
    bookmarkActions: bookmarkModule.actions,
    data: bookmarkModule.data,
    loadCapture: bookmarkModule.capture,
    snapshot: dial.snapshot,
    disabled,
    notice: dial.notice,
    run: dial.run,
    refresh: dial.refresh,
    announce: dial.announce,
    revision: dial.revision,
    searching: search.searching,
  });
  const folders = useFolderActions({
    source: bookmarkModule.source,
    bookmarkActions: bookmarkModule.actions,
    snapshot: dial.snapshot,
    disabled,
    notice: dial.notice,
    run: dial.run,
    refresh: dial.refresh,
    revision: dial.revision,
    context,
    bookmarkMode: search.bookmarkMode,
    closeSearch: search.closeSearch,
    askConfirmation: confirmation.askConfirmation,
  });
  const backup = useBackupFlow({
    backup: services.backup,
    source: bookmarkModule.source,
    lock,
    run: dial.run,
    notice: dial.notice,
    flushSettings: dial.flushSettings,
    disabled,
    settingsOpen: settings.settingsOpen,
    restoreDialogFocus: (element) => focus.restoreDialogFocus(element),
    forgetDialogFocus: (element) => focus.forgetDialogFocus(element),
  });
  const overlayOpen = computed(
    () =>
      !!confirmation.confirmation.value ||
      settings.settingsOpen.value ||
      backup.openingData.value ||
      bookmarks.bookmarkDialog.value ||
      backup.dataOpen.value ||
      folders.creatingFolder.value ||
      !!folders.editingFolder.value,
  );
  const focus = useScreenFocus({
    snapshot: dial.snapshot,
    results: search.results,
    disabled,
    overlayOpen,
    context,
  });
  const contextActions = useContextActions({
    openTab: services.openTab,
    bookmarkActions: bookmarkModule.actions,
    snapshot: dial.snapshot,
    revision: dial.revision,
    run: dial.run,
    notice: dial.notice,
    context,
    contextTarget: focus.contextTarget,
    disabled,
    overlayOpen,
    searching: search.searching,
    rememberContextTarget: focus.rememberContextTarget,
    closeContext: focus.closeContext,
    restorePageFocus: focus.restorePageFocus,
    folderAction: folders.folderAction,
    openBookmark: bookmarks.openBookmark,
    openSettings: settings.openSettings,
    askConfirmation: confirmation.askConfirmation,
    capturing: bookmarks.capturing,
    updateImages: bookmarks.updateImages,
  });
  const presentation = usePagePresentation(
    { snapshot: dial.snapshot, loading: dial.loading, notice: dial.notice },
    services.appearance.presentation,
  );
  usePageKeyboard({
    disabled,
    snapshot: dial.snapshot,
    overlayOpen,
    context,
    openingData: backup.openingData,
    dataOpen: backup.dataOpen,
    dataDialog: backup.dataDialog,
    searching: search.searching,
    openSearch: search.openSearch,
    closeSearch: search.closeSearch,
    rememberContextTarget: focus.rememberContextTarget,
    closeContext: focus.closeContext,
    closeSettings: settings.closeSettings,
  });
  return {
    dial,
    settings,
    confirmation,
    search,
    bookmarks,
    folders,
    backup,
    focus,
    contextActions,
    presentation,
    context,
    disabled,
    overlayOpen,
  };
}
