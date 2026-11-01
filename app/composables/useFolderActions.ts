import { message } from '../common/i18n/messages';
import { LocalizedError, errorMessage } from '../common/i18n/errors';
import { type MessageText } from '../common/i18n/contracts';
import { ref, shallowRef, watch } from 'vue';
import type { DialState } from './screenTypes';
import type { Ref } from 'vue';
import type { ContextState } from './screenTypes';
import type { IBookmarksSource, IBookmarkActions } from '../modules/bookmarks';
import type { useConfirmation } from './useConfirmation';
export function useFolderActions({
  source,
  bookmarkActions,
  snapshot,
  disabled,
  notice,
  run,
  refresh,
  revision,
  context,
  bookmarkMode,
  closeSearch,
  askConfirmation,
}: Pick<DialState, 'snapshot' | 'notice' | 'run' | 'refresh' | 'revision'> & {
  source: Pick<IBookmarksSource, 'selectFolder' | 'folder'>;
  bookmarkActions: Pick<
    IBookmarkActions,
    'renameFolder' | 'createFolder' | 'removeFolder' | 'reorderFolders'
  >;
  disabled: Readonly<Ref<boolean>>;
  context: Ref<ContextState | undefined>;
  bookmarkMode: Readonly<Ref<boolean>>;
  closeSearch(): void;
  askConfirmation: ReturnType<typeof useConfirmation>['askConfirmation'];
}) {
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
  async function selectFolder(id: string) {
    if (bookmarkMode.value) closeSearch();
    source.selectFolder(id);
    try {
      await refresh();
    } catch (error) {
      notice.value = errorMessage(error);
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
        selected
          ? bookmarkActions.renameFolder(selected.id, title)
          : bookmarkActions.createFolder(title),
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
      const folder = await source.folder(id);
      creatingFolder.value = false;
      folderDialogError.value = '';
      editingFolder.value = { id, title: folder.title };
    }
    if (name === 'delete') {
      const folder = await source.folder(id);
      askConfirmation(
        message('folders.delete.title'),
        message('folders.delete.description', { folder_name: folder.title }),
        () => run(() => bookmarkActions.removeFolder(id)),
      );
    }
  }
  async function reorderFolders(ids: string[], expected: string[], dragRevision: number) {
    await run(() => {
      if (dragRevision !== revision.value)
        throw new LocalizedError(message('bookmarks.errors.list_changed_before_drop'));
      return bookmarkActions.reorderFolders(ids, expected);
    });
  }

  return {
    folderDialogError,
    creatingFolder,
    editingFolder,
    selectFolder,
    beginFolder,
    cancelFolder,
    saveFolder,
    folderAction,
    reorderFolders,
  };
}
