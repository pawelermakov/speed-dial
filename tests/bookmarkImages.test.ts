import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookmarkImages } from '../utils/bookmarkImages';
import type { Bookmark } from '../types/models';

class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 64;
  src = '';
  decode = vi.fn(async () => {});
  constructor() { FakeImage.instances.push(this); }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); FakeImage.instances = []; });
function setup() {
  vi.stubGlobal('Image', FakeImage);
  let next = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:' + ++next);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  let previews: Record<string, string> = {};
  const cache = new BookmarkImages(value => { previews = value; });
  const bookmark: Bookmark = { id: '1', parentId: 'root', title: 'Site', url: 'https://example.com', index: 0, thumbnail: new Blob(['image']), favicon: null, thumbnailUpdatedAt: 1 };
  return { cache, bookmark, revoke, previews: () => previews };
}
describe('bookmark image lifecycle', () => {
  it('does not declare the initial batch ready until decode finishes', async () => {
    const { cache, bookmark, previews } = setup();
    const ready = cache.sync([bookmark]);
    let finish!: () => void;
    FakeImage.instances[0]!.decode.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    FakeImage.instances[0]!.onload!();
    expect(cache.pending).toBe(true);
    expect(previews()).toEqual({});
    finish();
    await ready;
    expect(cache.pending).toBe(false);
    expect(previews()['1']).toBe('blob:1');
    cache.dispose();
  });
  it('completes a failed decode as a text tile and releases pending waits on disposal', async () => {
    const { cache, bookmark, previews } = setup();
    let ready = cache.sync([bookmark]);
    FakeImage.instances[0]!.decode.mockRejectedValue(new Error('corrupt image'));
    FakeImage.instances[0]!.onload!();
    await ready;
    expect(cache.pending).toBe(false);
    expect(previews()).toEqual({});
    ready = cache.sync([{ ...bookmark, thumbnailUpdatedAt: 2 }]);
    cache.dispose();
    await ready;
  });
  it('retains a decoded preview for rename, reorder, and fresh IndexedDB blobs', async () => {
    const { cache, bookmark, revoke, previews } = setup();
    const ready = cache.sync([bookmark]);
    FakeImage.instances[0]!.onload!();
    await ready;
    const original = previews()['1'];
    cache.sync([{ ...bookmark, title: 'Renamed', index: 3, thumbnail: new Blob(['image']) }]);
    expect(previews()['1']).toBe(original);
    expect(FakeImage.instances).toHaveLength(1);
    expect(revoke).not.toHaveBeenCalled();
    cache.dispose();
    expect(revoke).toHaveBeenCalledTimes(1);
  });
  it('drops old URLs immediately and ignores late image callbacks', async () => {
    const { cache, bookmark, revoke, previews } = setup();
    cache.sync([bookmark]);
    const late = FakeImage.instances[0]!.onload!;
    const ready = cache.sync([{ ...bookmark, url: 'https://other.example', thumbnailUpdatedAt: 2 }]);
    late();
    expect(previews()).toEqual({});
    expect(revoke).toHaveBeenCalledWith('blob:1');
    FakeImage.instances[1]!.onload!();
    await ready;
    expect(previews()['1']).toBe('blob:2');
    cache.sync([]);
    expect(previews()).toEqual({});
    cache.dispose();
    expect(revoke).toHaveBeenCalledTimes(2);
  });
  it('does not repeatedly decode a corrupt unchanged preview', () => {
    const { cache, bookmark, previews } = setup();
    cache.sync([bookmark]);
    FakeImage.instances[0]!.onerror!();
    cache.sync([{ ...bookmark }]);
    expect(FakeImage.instances).toHaveLength(1);
    expect(previews()).toEqual({});
    cache.sync([{ ...bookmark, thumbnailUpdatedAt: 2 }]);
    expect(FakeImage.instances).toHaveLength(2);
    cache.dispose();
  });
});
