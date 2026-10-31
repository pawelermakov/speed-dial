import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialDatabase } from '../../../../../shared/infrastructure/database';
import { BookmarkAssetStore } from '../adapters/assets';

const databases: DialDatabase[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});
function setup() {
  const db = new DialDatabase('color-cache-' + crypto.randomUUID());
  databases.push(db);
  const decode = vi.fn(async (_blob: Blob): Promise<string | undefined> => '#754691');
  return { db, decode, store: new BookmarkAssetStore(db, decode) };
}
const icon = () => new Blob(['icon'], { type: 'image/png' });

describe('favicon color cache', () => {
  it('reads 100 cached tiles in one batch and preserves requested order and missing slots', async () => {
    const { db, store, decode } = setup();
    const keys: Array<[string, string]> = Array.from({ length: 100 }, (_, index) => [
      String(index),
      'https://example.com',
    ]);
    await db.tileAssets.bulkPut(
      keys.map(([bookmarkId, url]) => ({
        bookmarkId,
        url,
        favicon: icon(),
        faviconColor: '#754691',
      })),
    );
    const transactions = vi.spyOn(db.core, 'transaction');
    await Promise.all(keys.map(([id, url]) => store.get(id, url)));
    expect(transactions).toHaveBeenCalledTimes(100);
    transactions.mockClear();
    const bulkGet = vi.spyOn(db.tileAssets, 'bulkGet');
    const get = vi.spyOn(db.tileAssets, 'get');
    const requested: Array<[string, string]> = [
      keys[99]!,
      ['missing', 'https://example.com'],
      ...keys.slice(0, 99),
    ];
    const rows = await store.getMany(requested);
    expect(transactions).toHaveBeenCalledTimes(1);
    transactions.mockRestore();
    expect(rows.map((row) => row?.bookmarkId)).toEqual([
      '99',
      undefined,
      ...keys.slice(0, 99).map(([id]) => id),
    ]);
    expect(bulkGet).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expect(await store.getMany([])).toEqual([]);
    expect(bulkGet).toHaveBeenCalledTimes(1);
  });
  it('keeps batch tiles usable through invalid images, failed decodes and unavailable storage', async () => {
    const { db, store, decode } = setup();
    const keys: Array<[string, string]> = [
      ['valid', 'https://example.com'],
      ['invalid', 'https://example.com'],
    ];
    await db.tileAssets.bulkPut([
      { bookmarkId: 'valid', url: keys[0]![1], favicon: icon() },
      {
        bookmarkId: 'invalid',
        url: keys[1]![1],
        thumbnail: new Blob(['bad'], { type: 'text/plain' }),
      },
    ]);
    decode.mockRejectedValueOnce(new Error('transient decode failure'));
    const rows = await store.getMany(keys);
    expect(rows[0]?.favicon).toBeTruthy();
    expect(rows[0]?.faviconColor).toBeUndefined();
    expect(rows[1]?.thumbnail).toBeUndefined();
    expect((await store.getMany(keys))[0]?.faviconColor).toBe('#754691');
    vi.spyOn(db.tileAssets, 'bulkGet').mockRejectedValueOnce(new Error('storage unavailable'));
    expect(await store.getMany(keys)).toEqual([undefined, undefined]);
  });
  it('retries a temporary decoder failure without losing the favicon', async () => {
    const { db, store, decode } = setup();
    decode.mockRejectedValueOnce(new Error('temporary canvas failure'));
    await store.put('1', 'https://example.com', 'favicon', icon());
    expect((await db.tileAssets.get(['1', 'https://example.com']))?.faviconColor).toBeUndefined();
    const result = await store.get('1', 'https://example.com');
    expect(result?.favicon).toBeTruthy();
    expect(result?.faviconColor).toBe('#754691');
    await store.get('1', 'https://example.com');
    expect(decode).toHaveBeenCalledTimes(2);
  });
  it('persists the color with the icon and returns it before rendering after reload', async () => {
    const { db, store, decode } = setup();
    await store.put('1', 'https://example.com', 'favicon', icon());
    const reloaded = new BookmarkAssetStore(db, decode);
    expect((await reloaded.get('1', 'https://example.com'))?.faviconColor).toBe('#754691');
    expect((await reloaded.get('1', 'https://example.com'))?.faviconColor).toBe('#754691');
    expect(decode).toHaveBeenCalledTimes(1);
    await store.put('1', 'https://example.com', 'thumbnail', icon());
    expect((await reloaded.get('1', 'https://example.com'))?.faviconColor).toBe('#754691');
    expect(await reloaded.get('1', 'https://other.example')).toBeUndefined();
  });
  it('does not persist a temporary failure when resolving an uncached icon color', async () => {
    const { db, store, decode } = setup();
    await db.tileAssets.put({ bookmarkId: '1', url: 'https://example.com', favicon: icon() });
    decode.mockRejectedValueOnce(new Error('temporary decoder failure'));
    expect((await store.get('1', 'https://example.com'))?.favicon).toBeTruthy();
    expect((await db.tileAssets.get(['1', 'https://example.com']))?.faviconColor).toBeUndefined();
    expect((await store.get('1', 'https://example.com'))?.faviconColor).toBe('#754691');
    expect(decode).toHaveBeenCalledTimes(2);
  });
  it('resolves existing icons once and recalculates when the icon is replaced', async () => {
    const { db, store, decode } = setup();
    await db.tileAssets.put({ bookmarkId: '1', url: 'https://example.com', favicon: icon() });
    expect((await store.get('1', 'https://example.com'))?.faviconColor).toBe('#754691');
    await store.get('1', 'https://example.com');
    expect(decode).toHaveBeenCalledTimes(1);
    decode.mockResolvedValue('#345678');
    await store.put('1', 'https://example.com', 'favicon', icon());
    expect((await store.get('1', 'https://example.com'))?.faviconColor).toBe('#345678');
  });
  it('keeps fallback stable for unreadable icons and survives cache-write failure', async () => {
    const { db, store, decode } = setup();
    decode.mockResolvedValue(undefined);
    await store.put('1', 'https://example.com', 'favicon', icon());
    expect((await store.get('1', 'https://example.com'))?.faviconColor).toBeNull();
    expect(decode).toHaveBeenCalledTimes(1);
    await db.tileAssets.put({ bookmarkId: '2', url: 'https://example.com', favicon: icon() });
    decode.mockResolvedValue('#754691');
    vi.spyOn(db.tileAssets, 'update').mockRejectedValue(new Error('cache unavailable'));
    expect((await store.get('2', 'https://example.com'))?.faviconColor).toBe('#754691');
  });
});
