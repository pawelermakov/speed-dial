import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialDatabase } from '../services/database';
import { BookmarkAssetStore } from '../services/bookmarkAssets';

const databases: DialDatabase[] = [];
afterEach(async () => { for (const db of databases.splice(0)) await db.delete(); });
function setup() {
  const db = new DialDatabase('color-cache-' + crypto.randomUUID());
  databases.push(db);
  const decode = vi.fn(async (_blob: Blob): Promise<string | undefined> => '#754691');
  return { db, decode, store: new BookmarkAssetStore(db, decode) };
}
const icon = () => new Blob(['icon'], { type: 'image/png' });

describe('favicon color cache', () => {
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
    await db.tileAssets.put({ bookmarkId:'1', url:'https://example.com', favicon:icon() });
    decode.mockRejectedValueOnce(new Error('temporary decoder failure'));
    expect((await store.get('1','https://example.com'))?.favicon).toBeTruthy();
    expect((await db.tileAssets.get(['1','https://example.com']))?.faviconColor).toBeUndefined();
    expect((await store.get('1','https://example.com'))?.faviconColor).toBe('#754691');
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
