import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookmarkImages } from '../utils/bookmarkImages';
import type { Bookmark } from '../modules/dial/modules/bookmarks';

class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 64;
  src = '';
  decode = vi.fn(async () => {});
  constructor() {
    FakeImage.instances.push(this);
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  FakeImage.instances = [];
});
function setup() {
  vi.stubGlobal('Image', FakeImage);
  let next = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:' + ++next);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  let previews: Record<string, string> = {};
  const cache = new BookmarkImages((value) => {
    previews = value;
  });
  const bookmark: Bookmark = {
    id: '1',
    parentId: 'root',
    title: 'Site',
    url: 'https://example.com',
    index: 0,
    thumbnail: new Blob(['image']),
    favicon: null,
    thumbnailUpdatedAt: 1,
  };
  return { cache, bookmark, revoke, previews: () => previews };
}
describe('bookmark image lifecycle', () => {
  it('retains the open folder during search without accumulating old search-only images', async () => {
    const { cache, bookmark, revoke } = setup();
    const folder = [
      { ...bookmark, id: 'a' },
      { ...bookmark, id: 'b' },
    ];
    const ready = cache.sync(folder);
    for (const image of FakeImage.instances) image.onload!();
    await ready;
    await cache.sync([folder[0]!], true);
    expect(revoke).not.toHaveBeenCalled();
    const search = cache.sync([{ ...bookmark, id: 'external' }], true);
    FakeImage.instances[2]!.onload!();
    await search;
    await cache.sync([folder[0]!], true);
    expect(revoke).toHaveBeenCalledTimes(1);
    await cache.sync(folder);
    expect(FakeImage.instances).toHaveLength(3);
    expect(cache.pending).toBe(false);
    await cache.sync([]);
    expect(revoke).toHaveBeenCalledTimes(3);
    cache.dispose();
  });
  it('publishes once when decodes finish in separate browser tasks', async () => {
    const { bookmark } = setup();
    const changed = vi.fn();
    const cache = new BookmarkImages(changed);
    const ready = cache.sync([
      { ...bookmark, id: 'a' },
      { ...bookmark, id: 'b' },
    ]);
    FakeImage.instances[0]!.onload!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(cache.pending).toBe(true);
    FakeImage.instances[1]!.onload!();
    await ready;
    expect(changed).toHaveBeenCalledTimes(2);
    expect(Object.keys(changed.mock.calls[1]![0])).toEqual(['a', 'b']);
    cache.dispose();
  });
  it('batches simultaneous decodes and skips publishing unchanged resources', async () => {
    const { bookmark } = setup();
    const changed = vi.fn();
    const cache = new BookmarkImages(changed);
    const tabs = Array.from({ length: 100 }, (_, index) => ({ ...bookmark, id: String(index) }));
    const ready = cache.sync(tabs);
    expect(changed).toHaveBeenCalledTimes(1);
    for (const image of FakeImage.instances) image.onload!();
    await ready;
    expect(changed).toHaveBeenCalledTimes(2);
    expect(Object.keys(changed.mock.calls[1]![0])).toHaveLength(100);
    await cache.sync(tabs.map((tab) => ({ ...tab, title: 'Renamed' })));
    expect(changed).toHaveBeenCalledTimes(2);
    cache.dispose();
  });
  it('does not declare the initial batch ready until decode finishes', async () => {
    const { cache, bookmark, previews } = setup();
    const ready = cache.sync([bookmark]);
    let finish!: () => void;
    FakeImage.instances[0]!.decode.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
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
    void cache.sync([{ ...bookmark, title: 'Renamed', index: 3, thumbnail: new Blob(['image']) }]);
    expect(previews()['1']).toBe(original);
    expect(FakeImage.instances).toHaveLength(1);
    expect(revoke).not.toHaveBeenCalled();
    cache.dispose();
    expect(revoke).toHaveBeenCalledTimes(1);
  });
  it('drops old URLs immediately and ignores late image callbacks', async () => {
    const { cache, bookmark, revoke, previews } = setup();
    void cache.sync([bookmark]);
    const late = FakeImage.instances[0]!.onload!;
    const ready = cache.sync([
      { ...bookmark, url: 'https://other.example', thumbnailUpdatedAt: 2 },
    ]);
    late();
    expect(previews()).toEqual({});
    expect(revoke).toHaveBeenCalledWith('blob:1');
    FakeImage.instances[1]!.onload!();
    await ready;
    expect(previews()['1']).toBe('blob:2');
    void cache.sync([]);
    expect(previews()).toEqual({});
    cache.dispose();
    expect(revoke).toHaveBeenCalledTimes(2);
  });
  it('does not repeatedly decode a corrupt unchanged preview', () => {
    const { cache, bookmark, previews } = setup();
    void cache.sync([bookmark]);
    FakeImage.instances[0]!.onerror!();
    void cache.sync([{ ...bookmark }]);
    expect(FakeImage.instances).toHaveLength(1);
    expect(previews()).toEqual({});
    void cache.sync([{ ...bookmark, thumbnailUpdatedAt: 2 }]);
    expect(FakeImage.instances).toHaveLength(2);
    cache.dispose();
  });
});
