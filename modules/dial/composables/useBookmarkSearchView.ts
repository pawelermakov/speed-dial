import { ref, computed, watch, onUnmounted } from 'vue';
import { useBookmarkEdges } from '../../../composables/useBookmarkEdges';
import { useBookmarkSearch } from '../../../composables/useBookmarkSearch';
import SearchBar from '../../../components/SearchBar.vue';
import type { DialState, ScreenServices } from '../screenTypes';

export function useBookmarkSearchView({
  repository,
  snapshot,
  revision,
}: Pick<DialState, 'snapshot' | 'revision'> & { repository: ScreenServices['repository'] }) {
  const {
    query,
    results,
    pending: searchPending,
    error: searchError,
  } = useBookmarkSearch(repository, snapshot, revision);
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

  return {
    query,
    results,
    searchPending,
    searchError,
    searchText,
    bookmarkContent,
    searchControl,
    bookmarkMode,
    searching,
    folderNames,
    showEmptySearch,
    openSearch,
    closeSearch,
    focusSearchResult,
  };
}
