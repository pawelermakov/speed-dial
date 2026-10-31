import { afterEach, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useMailCounter } from '../composables/useMailCounter';
import type { MailProvider } from '../entities/models';
import type { MailService } from '../services/counter';
const state = vi.hoisted(() => ({ unmount: [] as Array<() => void> }));
vi.mock('vue', async () => ({
  ...(await vi.importActual('vue')),
  onUnmounted: (fn: () => void) => state.unmount.push(fn),
}));
afterEach(() => state.unmount.splice(0).forEach((fn) => fn()));
function fixture() {
  const provider = ref<MailProvider>('mailru');
  const unread = vi.fn<MailService['unread']>();
  const service: MailService = { unread, errorStatus: () => 'unauthenticated' };
  return { provider, service, unread };
}
it('cancels the previous provider and ignores its late response', async () => {
  const { provider, service, unread } = fixture();
  let finish!: (value: number) => void;
  unread
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(0);
  const counter = useMailCounter(provider, service);
  const oldSignal = unread.mock.calls[0]![1];
  provider.value = 'gmail';
  await nextTick();
  await Promise.resolve();
  expect(oldSignal.aborted).toBe(true);
  expect(counter.count.value).toBe(0);
  expect(counter.status.value).toBe('ready');
  finish(99);
  await Promise.resolve();
  expect(counter.count.value).toBe(0);
  expect(unread).toHaveBeenCalledTimes(2);
});
it('keeps an unknown count while loading or unauthenticated', async () => {
  const { provider, service, unread } = fixture();
  unread.mockResolvedValueOnce(5).mockRejectedValueOnce(new Error('sign in'));
  const counter = useMailCounter(provider, service);
  await Promise.resolve();
  expect(counter.count.value).toBe(5);
  provider.value = 'yandex';
  await nextTick();
  await Promise.resolve();
  expect(counter.count.value).toBeNull();
  expect(counter.status.value).toBe('unauthenticated');
});
it('aborts on teardown and never publishes the pending result', async () => {
  const { provider, service, unread } = fixture();
  let finish!: (value: number) => void;
  unread.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const counter = useMailCounter(provider, service);
  const signal = unread.mock.calls[0]![1];
  state.unmount.splice(0).forEach((fn) => fn());
  expect(signal.aborted).toBe(true);
  finish(42);
  await Promise.resolve();
  provider.value = 'gmail';
  await nextTick();
  expect(counter.count.value).toBeNull();
  expect(unread).toHaveBeenCalledTimes(1);
});
