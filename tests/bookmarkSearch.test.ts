import { formatMessage } from '../services/i18n';
import { afterEach, expect, it, vi } from 'vitest';
import { ref, shallowRef, nextTick } from 'vue';
import { useBookmarkSearch } from '../composables/useBookmarkSearch';
import type { Repository } from '../services/repository';
import { defaults, type Snapshot, type Bookmark } from '../types/models';
const state = vi.hoisted(() => ({ unmount: [] as Array<() => void> }));
vi.mock('vue', async () => ({
  ...(await vi.importActual('vue')),
  onUnmounted: (fn: () => void) => state.unmount.push(fn),
}));
afterEach(() => {
  state.unmount.splice(0).forEach((fn) => fn());
});
const initial: Snapshot = {
  tabs: [],
  folders: [],
  rootId: 'root',
  activeId: 'work',
  settings: defaults,
  background: null,
};
it('rejects stale results, refreshes on browser snapshots and clears query/errors', async () => {
  let finish!: (rows: Bookmark[]) => void;
  const search = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue([{ id: 'new' }]);
  const snapshot = shallowRef(initial),
    dial = useBookmarkSearch({ search } as unknown as Repository, snapshot);
  dial.query.value = 'old';
  dial.query.value = 'new';
  await nextTick();
  finish([{ id: 'old' } as Bookmark]);
  await nextTick();
  expect(dial.results.value[0]?.id).toBe('new');
  search.mockRejectedValueOnce(new Error('offline'));
  snapshot.value = { ...initial };
  await nextTick();
  expect(dial.results.value).toEqual([]);
  expect(formatMessage(dial.error.value)).toContain('offline');
  dial.query.value = ' ';
  expect(dial.error.value).toBe('');
  expect(dial.pending.value).toBe(false);
  expect(snapshot.value.activeId).toBe('work');
});
it('ignores late search completions after unmount', async () => {
  let finish!: (rows: Bookmark[]) => void;
  const search = vi.fn(
    () =>
      new Promise<Bookmark[]>((resolve) => {
        finish = resolve;
      }),
  );
  const dial = useBookmarkSearch({ search } as unknown as Repository, shallowRef(initial));
  dial.query.value = 'query';
  state.unmount.splice(0).forEach((fn) => fn());
  finish([{ id: 'late' } as Bookmark]);
  await nextTick();
  expect(dial.results.value).toEqual([]);
});
it('invalidates results immediately on browser changes independently of the normal folder read', async () => {
  const revision = ref(0),
    search = vi.fn().mockResolvedValue([{ id: 'first' }]);
  const dial = useBookmarkSearch(
    { search } as unknown as Repository,
    shallowRef(initial),
    revision,
  );
  dial.query.value = 'query';
  await nextTick();
  expect(dial.results.value).toHaveLength(1);
  search.mockRejectedValueOnce(new Error('API unavailable'));
  revision.value++;
  expect(dial.results.value).toEqual([]);
  await nextTick();
  expect(formatMessage(dial.error.value)).toContain('API unavailable');
  revision.value++;
  await nextTick();
  expect(dial.error.value).toBe('');
  expect(dial.results.value).toHaveLength(1);
});
