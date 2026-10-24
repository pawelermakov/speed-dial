import Dexie, { type Table } from 'dexie';
import type { BookmarkAssets } from '../types/models';
export class DialDatabase extends Dexie {
  autoNames!: Table<{ bookmarkId: string; url: string; token: string; pendingEdit?: { url: boolean; title: boolean } }, string>;
  tileAssets!: Table<BookmarkAssets, [string, string]>;
  assets!: Table<{ key: string; blob: Blob }, string>;
  constructor(name = 'SpeedDialX') {
    super(name);
    this.version(3).stores({ assets: 'key', tileAssets: '[bookmarkId+url],bookmarkId', autoNames: 'bookmarkId' });
  }
}
export const db = new DialDatabase();
