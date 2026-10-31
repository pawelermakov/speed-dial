import { afterEach, describe, expect, it, vi } from 'vitest';
import { withDataLock } from './dataLock';
afterEach(() => vi.unstubAllGlobals());
describe('data lock', () => {
  it('serializes the fallback queue and releases it after a failure', async () => {
    vi.stubGlobal('navigator', {});
    const order: string[] = [];
    let release!: () => void;
    const first = withDataLock(async () => {
      order.push('first');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      throw new Error('failed');
    });
    const failure = expect(first).rejects.toThrowLocalized('failed');
    const second = withDataLock(async () => {
      order.push('second');
      return 42;
    });
    await Promise.resolve();
    expect(order).toEqual(['first']);
    release();
    await failure;
    expect(await second).toBe(42);
    expect(order).toEqual(['first', 'second']);
  });
  it('uses the existing cross-context native lock name', async () => {
    const request = vi.fn(async (_name: string, job: () => Promise<number>) => job());
    vi.stubGlobal('navigator', { locks: { request } });
    expect(await withDataLock(async () => 7)).toBe(7);
    expect(request).toHaveBeenCalledWith('speed-dial-data', expect.any(Function));
  });
});
