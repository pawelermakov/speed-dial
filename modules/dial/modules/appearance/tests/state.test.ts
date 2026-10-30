import { afterEach, expect, it, vi } from 'vitest';
import { useBackgroundState } from '../composables/useBackgroundState';
import { errorMessage } from '../../../../../services/i18n';
const lifecycle = vi.hoisted(() => ({ unmount: [] as Array<() => void> }));
vi.mock('vue', async () => ({
  ...(await vi.importActual('vue')),
  onUnmounted: (callback: () => void) => lifecycle.unmount.push(callback),
}));
afterEach(() => lifecycle.unmount.splice(0).forEach((callback) => callback()));
it('does not roll a later background back after an earlier failure', async () => {
  let fail!: (error: Error) => void;
  const publish = vi.fn(),
    announce = vi.fn();
  const save = vi
    .fn<(blob: Blob | null) => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    )
    .mockResolvedValueOnce(undefined);
  const state = useBackgroundState({
    read: async () => null,
    save,
    publish,
    announce,
    track: (promise) => promise,
    errorText: errorMessage,
  });
  const old = state.change(new Blob(['old'])),
    current = new Blob(['current']);
  expect(await state.change(current)).toBe(true);
  fail(new Error('old failed'));
  expect(await old).toBe(false);
  expect(publish).toHaveBeenCalledExactlyOnceWith(current);
  expect(state.error.value).toBeUndefined();
  expect(announce).toHaveBeenCalledTimes(1);
});
it('ignores a startup read after a full refresh was accepted', async () => {
  let finish!: (blob: Blob | null) => void;
  const publish = vi.fn();
  const state = useBackgroundState({
    read: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    save: async () => {},
    publish,
    announce: () => {},
    track: (promise) => promise,
    errorText: errorMessage,
  });
  state.loadInitial();
  state.acceptRead(true);
  finish(new Blob(['stale']));
  await Promise.resolve();
  expect(publish).not.toHaveBeenCalled();
});
