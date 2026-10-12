import Dexie, { type Table } from 'dexie';
import type { BookmarkAssets } from '../types/models';
export class DialDatabase extends Dexie {
  tileAssets!: Table<BookmarkAssets, [string, string]>;
  assets!: Table<{ key: string; blob: Blob }, string>;
  constructor(name = 'SpeedDialX') {
    super(name);
    this.version(1).stores({ bookmarks: '++id,position', assets: 'key', journal: 'key' });
    this.version(2).stores({ bookmarks: null, journal: null, assets: 'key', tileAssets: '[bookmarkId+url],bookmarkId' });
  }
}
export const db = new DialDatabase();
