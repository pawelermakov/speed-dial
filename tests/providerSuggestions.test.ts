import { formatMessage } from '../services/i18n';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useProviderSuggestions } from '../composables/useProviderSuggestions';
import type { SearchProviderId, SearchSuggestion } from '../types/models';
const state = vi.hoisted(() => ({ unmount: [] as Array<() => void>, fetch: vi.fn() }));
vi.mock('vue', async () => ({
  ...(await vi.importActual('vue')),
  onUnmounted: (fn: () => void) => state.unmount.push(fn),
}));
vi.mock('../services/searchProviders', () => ({ providerSuggestions: state.fetch }));
beforeEach(() => {
  vi.useFakeTimers();
  state.fetch.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  state.unmount.splice(0).forEach((fn) => fn());
  vi.useRealTimers();
});
it('debounces input, calls only the selected provider and cancels stale requests', async () => {
  const query = ref(''),
    provider = ref<SearchProviderId>('google');
  const dial = useProviderSuggestions(query, provider);
  let finish!: (rows: SearchSuggestion[]) => void;
  state.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  query.value = 'M';
  await vi.advanceTimersByTimeAsync(200);
  query.value = 'Matrix';
  await vi.advanceTimersByTimeAsync(249);
  expect(state.fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(state.fetch).toHaveBeenCalledWith('google', 'Matrix', expect.any(AbortSignal));
  const firstSignal = state.fetch.mock.calls[0]![2] as AbortSignal;
  provider.value = 'imdb';
  expect(firstSignal.aborted).toBe(true);
  expect(dial.items.value).toEqual([]);
  state.fetch.mockResolvedValueOnce([{ id: 'new', label: 'New' }]);
  await vi.advanceTimersByTimeAsync(250);
  finish([{ id: 'old', label: 'Old' }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(dial.items.value[0]?.id).toBe('new');
  expect(query.value).toBe('Matrix');
});
it('does not send empty input, exposes errors and ignores late completions after teardown', async () => {
  const query = ref(''),
    provider = ref<SearchProviderId>('myshows'),
    dial = useProviderSuggestions(query, provider);
  query.value = ' ';
  await vi.advanceTimersByTimeAsync(300);
  expect(state.fetch).not.toHaveBeenCalled();
  state.fetch.mockRejectedValueOnce(new Error('HTTP 403'));
  query.value = 'test';
  await vi.advanceTimersByTimeAsync(250);
  expect(dial.loaded.value).toBe(true);
  expect(formatMessage(dial.error.value)).toBe('Подсказки временно недоступны');
  let finish!: (rows: SearchSuggestion[]) => void;
  state.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  query.value = 'late';
  await vi.advanceTimersByTimeAsync(250);
  state.unmount.splice(0).forEach((fn) => fn());
  finish([{ id: 'late', label: 'Late' }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(dial.items.value).toEqual([]);
});

it('switching to bookmarks cancels remote work and never sends local queries', async () => {
  const query = ref(''),
    provider = ref<SearchProviderId>('google'),
    dial = useProviderSuggestions(query, provider);
  let finish!: (rows: SearchSuggestion[]) => void;
  state.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  query.value = 'remote';
  await vi.advanceTimersByTimeAsync(250);
  const signal = state.fetch.mock.calls[0]![2] as AbortSignal;
  provider.value = 'bookmarks';
  query.value = 'private bookmark';
  expect(signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(state.fetch).toHaveBeenCalledTimes(1);
  finish([{ id: 'old', label: 'Old' }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(dial.items.value).toEqual([]);
  expect(dial.loaded.value).toBe(false);
});
