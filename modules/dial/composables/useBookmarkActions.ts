import { message } from '../../../shared/i18n/messages';
import { LocalizedError, errorMessage } from '../../../shared/i18n/errors';
import { type MessageText } from '../../../shared/i18n/contracts';
import { ref, shallowRef } from 'vue';
import { prepareCapture } from '../../../modules/dial/modules/capture/prepare';
import { normalizeUrl } from '../../../services/validation';
import type { Bookmark, Folder } from '../modules/bookmarks';
import type { DialState, ScreenServices } from '../screenTypes';
import type { Ref } from 'vue';

export function useBookmarkActions({
  source,
  bookmarkActions,
  nativeBookmarks,
  services,
  snapshot,
  disabled,
  notice,
  run,
  refresh,
  announce,
  revision,
  searching,
}: Pick<DialState, 'snapshot' | 'notice' | 'run' | 'refresh' | 'announce' | 'revision'> & {
  source: Pick<
    ScreenServices['bookmarks']['source'],
    'rootNode' | 'choices' | 'bookmark' | 'parent'
  >;
  bookmarkActions: Pick<ScreenServices['bookmarks']['actions'], 'add' | 'edit' | 'reorder'>;
  nativeBookmarks: Pick<ScreenServices['bookmarks']['bookmarks'], 'getChildren'>;
  services: Pick<ScreenServices, 'captureBookmarks' | 'getCapture'>;
  disabled: Readonly<Ref<boolean>>;
  searching: Readonly<Ref<boolean>>;
}) {
  const capturing = ref(false);
  const savingBookmark = ref(false);
  const bookmarkDialog = ref(false);
  const editing = shallowRef<Bookmark>();
  const dialogError = ref<MessageText>('');
  const folderError = ref<MessageText>('');
  const dialogFolders = ref<Folder[]>([]);
  async function openBookmark(bookmark?: Bookmark) {
    if (disabled.value) return;
    try {
      const root = await source.rootNode();
      const [choices, children] = await Promise.all([
        source.choices(),
        nativeBookmarks.getChildren(root.id),
      ]);
      const choiceIds = new Set(choices.map((choice) => choice.id));
      dialogFolders.value = [
        { id: root.id, title: root.title, index: -1 },
        ...children
          .filter((row) => !row.url && choiceIds.has(row.id))
          .map((row) => ({ id: row.id, title: row.title, index: row.index ?? 0 })),
      ];
      editing.value = bookmark
        ? ({ ...bookmark, ...(await source.bookmark(bookmark.id)) } as Bookmark)
        : undefined;
      dialogError.value = '';
      folderError.value = '';
      bookmarkDialog.value = true;
    } catch (error) {
      notice.value = errorMessage(error);
    }
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
        await source.parent(value.parentId);
      } catch (error) {
        folderError.value = errorMessage(error);
        return;
      }
      const selected = editing.value;
      const idResult = { id: selected?.id ?? '' };
      let capture = !selected && value.capture;
      if (
        !(await run(async () => {
          if (selected)
            capture = await bookmarkActions.edit(
              selected.id,
              url,
              value.title,
              value.parentId,
              value.titleEdited,
              selected,
            );
          else
            idResult.id = await bookmarkActions.add({
              url,
              title: value.title,
              parentId: value.parentId,
            });
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
          notice.value = message('bookmarks.notices.saved_with_warning', {
            error: errorMessage(error),
          });
        } finally {
          capturing.value = false;
        }
      }
    } catch (error) {
      dialogError.value = errorMessage(error);
    } finally {
      savingBookmark.value = false;
    }
  }
  function reorder(ids: string[], expected: string[], dragRevision: number) {
    const parent = snapshot.value.activeId;
    if (!searching.value)
      void run(() => {
        if (dragRevision !== revision.value)
          throw new LocalizedError(message('bookmarks.errors.list_changed_before_drop'));
        return bookmarkActions.reorder(ids, expected, parent);
      });
  }
  async function updateImages(id: string, url: string) {
    const prepared = await prepareCapture(
      services.captureBookmarks,
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

  return {
    capturing,
    savingBookmark,
    bookmarkDialog,
    editing,
    dialogError,
    folderError,
    dialogFolders,
    openBookmark,
    saveBookmark,
    reorder,
    updateImages,
  };
}
