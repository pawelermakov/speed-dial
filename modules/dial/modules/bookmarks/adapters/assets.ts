import { message } from '../../../../../shared/i18n/messages';
import { LocalizedError } from '../../../../../shared/i18n/errors';
import type { DialDatabase } from '../../../../../shared/infrastructure/database';
import type { AssetsPort } from '../services/interfaces';
import type { BookmarkAssets } from '../entities/models';
import { readFaviconColor } from '../../../../../services/faviconColor';
function valid(blob: unknown): blob is Blob {
  return (
    blob instanceof Blob &&
    /^image\/(png|jpeg|webp|gif|bmp|avif|x-icon|vnd.microsoft.icon)$/.test(blob.type) &&
    blob.size <= 20 * 1024 * 1024
  );
}
// Optional, reproducible tile resources. This store never reads or mutates browser bookmarks.
export class BookmarkAssetStore implements AssetsPort {
  constructor(
    private db: DialDatabase,
    private colorOf = readFaviconColor,
  ) {}
  async getStored(bookmarkId: string, url: string): Promise<BookmarkAssets | undefined> {
    return this.db.tileAssets.get([bookmarkId, url]);
  }
  async get(bookmarkId: string, url: string): Promise<BookmarkAssets | undefined> {
    try {
      return await this.prepare(await this.db.tileAssets.get([bookmarkId, url]));
    } catch {
      return undefined;
    }
  }
  async getMany(keys: Array<[string, string]>): Promise<Array<BookmarkAssets | undefined>> {
    if (!keys.length) return [];
    try {
      // bulkGet shares one readonly transaction instead of opening one per tile.
      const rows = await this.db.tileAssets.bulkGet(keys);
      return await Promise.all(rows.map((row) => this.prepare(row)));
    } catch {
      return keys.map(() => undefined);
    }
  }
  private async prepare(row: BookmarkAssets | undefined): Promise<BookmarkAssets | undefined> {
    try {
      if (!row) return undefined;
      const { bookmarkId, url } = row;
      if (row && valid(row.favicon)) {
        if (row.faviconColor === undefined) {
          let resolved = false;
          try {
            row.faviconColor = (await this.colorOf(row.favicon)) ?? null;
            resolved = true;
          } catch {
            row.faviconColor = undefined;
          }
          // Retry unresolved colors without overwriting an icon updated during decoding.
          if (resolved)
            await this.db
              .transaction('rw', this.db.tileAssets, async () => {
                const latest = await this.db.tileAssets.get([bookmarkId, url]);
                if (latest && latest.faviconUpdatedAt === row.faviconUpdatedAt)
                  await this.db.tileAssets.update([bookmarkId, url], {
                    faviconColor: row.faviconColor,
                  });
              })
              .catch(() => {});
        }
      } else if (row) row.faviconColor = null;
      return row
        ? {
            ...row,
            thumbnail: valid(row.thumbnail) ? row.thumbnail : undefined,
            favicon: valid(row.favicon) ? row.favicon : undefined,
          }
        : undefined;
    } catch {
      return undefined;
    }
  }
  async put(bookmarkId: string, url: string, resource: 'thumbnail' | 'favicon', blob: Blob) {
    if (!valid(blob)) throw new LocalizedError(message('images.errors.unsupported'));
    let color: string | null | undefined;
    if (resource === 'favicon') {
      try {
        color = (await this.colorOf(blob)) ?? null;
      } catch {
        /* Retry a transient decoder failure on a subsequent read. */
      }
    }
    await this.db.transaction('rw', this.db.tileAssets, async () => {
      const old = await this.db.tileAssets.get([bookmarkId, url]);
      const revision = Math.max(
        Date.now(),
        (old?.[resource === 'thumbnail' ? 'thumbnailUpdatedAt' : 'faviconUpdatedAt'] ?? 0) + 1,
      );
      await this.db.tileAssets.put({
        ...old,
        bookmarkId,
        url,
        [resource]: blob,
        [resource + 'UpdatedAt']: revision,
        ...(resource === 'favicon' ? { faviconColor: color } : {}),
      });
    });
  }
  async remove(bookmarkId: string) {
    await this.db.tileAssets
      .where('bookmarkId')
      .equals(bookmarkId)
      .delete()
      .catch(() => {});
  }
  async clear() {
    await this.db.tileAssets.clear();
  }
}
