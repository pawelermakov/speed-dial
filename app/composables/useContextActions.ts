import { message } from '../common/i18n/messages';
import { LocalizedError, errorMessage } from '../common/i18n/errors';
import { computed } from 'vue';
import { insertedOrder } from '../modules/bookmarks';
import type { Bookmark, Folder, IBookmarkActions } from '../modules/bookmarks';
import type { DialState } from './screenTypes';
import type { Ref } from 'vue';
import type { ContextState, FocusTarget } from './screenTypes';
import type { useFolderActions } from './useFolderActions';
import type { useBookmarkActions } from './useBookmarkActions';
import type { useConfirmation } from './useConfirmation';
export function useContextActions({
  openTab,
  bookmarkActions,
  snapshot,
  revision,
  run,
  notice,
  context,
  contextTarget,
  disabled,
  overlayOpen,
  searching,
  rememberContextTarget,
  closeContext,
  restorePageFocus,
  folderAction,
  openBookmark,
  openSettings,
  askConfirmation,
  capturing,
  updateImages,
}: Pick<DialState, 'snapshot' | 'revision' | 'run' | 'notice'> & {
  openTab(url: string): Promise<void>;
  bookmarkActions: Pick<IBookmarkActions, 'reorder' | 'reorderFolders' | 'remove'>;
  context: Ref<ContextState | undefined>;
  contextTarget: Ref<FocusTarget | undefined>;
  disabled: Readonly<Ref<boolean>>;
  overlayOpen: Readonly<Ref<boolean>>;
  searching: Readonly<Ref<boolean>>;
  rememberContextTarget(element?: Element | null): void;
  closeContext(): void;
  restorePageFocus(target?: FocusTarget): void;
  folderAction: ReturnType<typeof useFolderActions>['folderAction'];
  openBookmark: ReturnType<typeof useBookmarkActions>['openBookmark'];
  openSettings(): void;
  askConfirmation: ReturnType<typeof useConfirmation>['askConfirmation'];
  capturing: Ref<boolean>;
  updateImages(id: string, url: string): Promise<void>;
}) {
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
  async function action(name: string) {
    const selected = context.value?.bookmark;
    const folder = context.value?.folder;
    const moveExpected = contextOrder.value.slice();
    const moveRevision = revision.value;
    const returnTarget = contextTarget.value;
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
              ? bookmarkActions.reorderFolders(ids, moveExpected)
              : bookmarkActions.reorder(ids, moveExpected, selected!.parentId);
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
      if (name === 'open') await openTab(selected.url);
      if (name === 'edit') await openBookmark(selected);
      if (name === 'delete')
        askConfirmation(
          message('bookmarks.delete.title'),
          message('bookmarks.delete.description', { bookmark_name: selected.title }),
          () => run(() => bookmarkActions.remove(selected.id)),
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
      notice.value = errorMessage(error);
    } finally {
      if (!overlayOpen.value) restorePageFocus(returnTarget);
    }
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

  return { showContext, showFolderContext, action, canMove };
}
