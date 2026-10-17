import type { DialDatabase } from './database';
import type { BookmarkAssets } from '../types/models';
import { readFaviconColor, faviconColorVersion } from './faviconColor';
function valid(blob: unknown): blob is Blob {
  return blob instanceof Blob && /^image\/(png|jpeg|webp|gif|bmp|avif|x-icon|vnd.microsoft.icon)$/.test(blob.type) && blob.size <= 20 * 1024 * 1024;
}
// Optional, reproducible tile resources. This store never reads or mutates browser bookmarks.
export class BookmarkAssetStore {
  constructor(private db: DialDatabase, private colorOf = readFaviconColor) {}
  async get(bookmarkId: string, url: string): Promise<BookmarkAssets | undefined> {
    try {
      const row = await this.db.tileAssets.get([bookmarkId, url]);
      if (row && valid(row.favicon)) {
        if (row.faviconColorVersion !== faviconColorVersion || (row.faviconColor !== null && !/^#[0-9a-f]{6}$/i.test(row.faviconColor ?? ''))) {
          let resolved = false;
          try {
            row.faviconColor = await this.colorOf(row.favicon) ?? null;
            row.faviconColorVersion = faviconColorVersion;
            resolved = true;
          } catch {
            row.faviconColor = undefined;
            row.faviconColorVersion = undefined;
          }
          // Backfill old caches without overwriting an icon updated during decoding.
          if (resolved) await this.db.transaction('rw', this.db.tileAssets, async () => {
            const latest = await this.db.tileAssets.get([bookmarkId, url]);
            if (latest && latest.faviconUpdatedAt === row.faviconUpdatedAt)
              await this.db.tileAssets.update([bookmarkId, url], { faviconColor: row.faviconColor, faviconColorVersion });
          }).catch(() => {});
        }
      } else if (row) row.faviconColor = null;
      return row ? { ...row, thumbnail: valid(row.thumbnail) ? row.thumbnail : undefined, favicon: valid(row.favicon) ? row.favicon : undefined } : undefined;
    } catch { return undefined; }
  }
  async put(bookmarkId: string, url: string, resource: 'thumbnail' | 'favicon', blob: Blob) {
    if (!valid(blob)) throw new Error('Неподдерживаемое изображение.');
    let color: string | null | undefined;
    let colorVersion: number | undefined;
    if (resource === 'favicon') {
      try { color = await this.colorOf(blob) ?? null; colorVersion = faviconColorVersion; }
      catch { /* Retry a transient decoder failure on a subsequent read. */ }
    }
    await this.db.transaction('rw', this.db.tileAssets, async () => {
      const old = await this.db.tileAssets.get([bookmarkId, url]);
      const revision = Math.max(Date.now(), (old?.[resource === 'thumbnail' ? 'thumbnailUpdatedAt' : 'faviconUpdatedAt'] ?? 0) + 1);
      await this.db.tileAssets.put({ ...old, bookmarkId, url, [resource]: blob, [resource + 'UpdatedAt']: revision, ...(resource === 'favicon' ? { faviconColor: color, faviconColorVersion: colorVersion } : {}) });
    });
  }
  async remove(bookmarkId: string) { await this.db.tileAssets.where('bookmarkId').equals(bookmarkId).delete().catch(() => {}); }
  async clear() { await this.db.tileAssets.clear(); }
}
