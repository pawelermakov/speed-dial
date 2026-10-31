import { computed, shallowRef } from 'vue';
import { useServices } from '../../../app/serviceContext';
import { useDial } from './useDial';
import { useTheme } from '../modules/appearance/composables/useTheme';
import type { ContextState } from '../screenTypes';
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
  const core = {
    ...dial,
    services,
    source: bookmarkModule.source,
    bookmarkActions: bookmarkModule.actions,
    nativeBookmarks: bookmarkModule.bookmarks,
    lock,
    context,
    disabled,
  };
  const settings = useSettingsPanel(dial);
  const confirmation = useConfirmation(core);
  const search = useBookmarkSearchView(core);
  const bookmarks = useBookmarkActions({ ...core, ...search });
  const folders = useFolderActions({ ...core, ...search, ...confirmation });
  const backup = useBackupFlow({
    ...core,
    ...settings,
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
  const focus = useScreenFocus({ ...core, ...search, overlayOpen });
  const contextActions = useContextActions({
    ...core,
    ...search,
    ...bookmarks,
    ...folders,
    ...confirmation,
    ...settings,
    ...focus,
    overlayOpen,
  });
  const presentation = usePagePresentation(dial);
  usePageKeyboard({ ...core, ...search, ...settings, ...backup, ...focus, overlayOpen });
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
