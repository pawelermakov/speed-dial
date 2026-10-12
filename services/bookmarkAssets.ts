import type { DialDatabase } from './database';
import type { BookmarkAssets } from '../types/models';
function valid(blob: unknown): blob is Blob {
  return blob instanceof Blob && /^image\/(png|jpeg|webp|gif|bmp|avif|x-icon|vnd.microsoft.icon)$/.test(blob.type) && blob.size <= 20 * 1024 * 1024;
}
// Optional, reproducible tile resources. This store never reads or mutates browser bookmarks.
export class BookmarkAssetStore {
  constructor(private db: DialDatabase) {}
  async get(bookmarkId: string, url: string): Promise<BookmarkAssets | undefined> {
    try {
      const row = await this.db.tileAssets.get([bookmarkId, url]);
      return row ? { ...row, thumbnail: valid(row.thumbnail) ? row.thumbnail : undefined, favicon: valid(row.favicon) ? row.favicon : undefined } : undefined;
    } catch { return undefined; }
  }
  async put(bookmarkId: string, url: string, resource: 'thumbnail' | 'favicon', blob: Blob) {
    if (!valid(blob)) throw new Error('Неподдерживаемое изображение.');
    await this.db.transaction('rw', this.db.tileAssets, async () => {
      const old = await this.db.tileAssets.get([bookmarkId, url]);
      await this.db.tileAssets.put({ ...old, bookmarkId, url, [resource]: blob, [resource + 'UpdatedAt']: Date.now() });
    });
  }
  async remove(bookmarkId: string) { await this.db.tileAssets.where('bookmarkId').equals(bookmarkId).delete().catch(() => {}); }
  async clear() { await this.db.tileAssets.clear(); }
}
