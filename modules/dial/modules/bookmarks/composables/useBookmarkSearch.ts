import { errorMessage } from '../../../../../shared/i18n/errors';
import { message } from '../../../../../shared/i18n/messages';
import { type MessageText } from '../../../../../shared/i18n/contracts';
import { ref, shallowRef, watch, onUnmounted, type Ref } from 'vue';
import type { Bookmark, BookmarkSearchView } from '../entities/models';
import type { BookmarkSearchPort } from '../services/interfaces';

export function useBookmarkSearch(
  source: BookmarkSearchPort,
  snapshot: Readonly<Ref<BookmarkSearchView>>,
  revision: Ref<number> = ref(0),
) {
  const query = ref(''),
    results = shallowRef<Bookmark[]>([]),
    pending = ref(false),
    error = ref<MessageText>('');
  let generation = 0;
  const stop = watch(
    [query, snapshot, revision],
    async () => {
      const current = ++generation;
      results.value = [];
      error.value = '';
      const text = query.value.trim();
      pending.value = !!text && !!snapshot.value.rootId;
      if (!pending.value) return;
      try {
        const next = await source.search(text, snapshot.value.tabs);
        if (current === generation) results.value = next;
      } catch (cause) {
        if (current === generation)
          error.value = message('search.bookmarks.errors.failed', { error: errorMessage(cause) });
      } finally {
        if (current === generation) pending.value = false;
      }
    },
    { flush: 'sync' },
  );
  onUnmounted(() => {
    generation++;
    stop();
  });
  return { query, results, pending, error };
}
