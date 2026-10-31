import { message, LocalizedError, errorMessage, type MessageText } from '../../../services/i18n';
import { ref, shallowRef } from 'vue';
import { prepareCapture } from '../../../modules/dial/modules/capture/prepare';
import { normalizeUrl } from '../../../services/validation';
import type { Bookmark, Folder } from '../../../types/models';
import type { DialState, ScreenServices } from '../screenTypes';
import type { Ref } from 'vue';

export function useBookmarkActions({
  repository,
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
  repository: ScreenServices['repository'];
  services: ScreenServices;
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
        await repository.parent(value.parentId);
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
            capture = await repository.edit(
              selected.id,
              url,
              value.title,
              value.parentId,
              value.titleEdited,
              selected,
            );
          else
            idResult.id = await repository.add({
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
