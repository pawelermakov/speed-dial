import { describe, expect, it, vi } from 'vitest';
import { createLazyLoader } from './lazy';
describe('application lazy ownership', () => {
  it('shares one pending load and retries after failure', async () => {
    const load = vi
      .fn<() => Promise<{ id: number }>>()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce({ id: 2 });
    const loader = createLazyLoader(load);
    const first = loader.get();
    expect(loader.get()).toBe(first);
    await expect(first).rejects.toThrowLocalized('load failed');
    expect(await loader.get()).toEqual({ id: 2 });
    expect(await loader.get()).toEqual({ id: 2 });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('handles synchronous loader errors as retryable rejections', async () => {
    const load = vi
      .fn<() => Promise<number>>()
      .mockImplementationOnce(() => {
        throw new Error('failed');
      })
      .mockResolvedValueOnce(1);
    const loader = createLazyLoader(load);
    await expect(loader.get()).rejects.toThrowLocalized('failed');
    expect(await loader.get()).toBe(1);
  });
  it.each([false, true])(
    'releases a module exactly once, disposal while loading=%s',
    async (whileLoading) => {
      let finish!: (value: { id: number }) => void;
      const release = vi.fn();
      const loader = createLazyLoader(
        () =>
          new Promise<{ id: number }>((resolve) => {
            finish = resolve;
          }),
        release,
      );
      const promise = loader.get();
      await Promise.resolve();
      const module = { id: 1 };
      if (whileLoading) {
        loader.dispose();
        finish(module);
        await expect(promise).rejects.toThrowLocalized('disposed');
      } else {
        finish(module);
        await promise;
        loader.dispose();
      }
      loader.dispose();
      expect(release).toHaveBeenCalledExactlyOnceWith(module);
      await expect(loader.get()).rejects.toThrowLocalized('disposed');
    },
  );
});
