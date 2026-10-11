import Dexie, { type Table } from 'dexie';
import type { Bookmark, Settings } from '../types/models';

export class DialDatabase extends Dexie {
  bookmarks!: Table<Bookmark, number>;
  assets!: Table<{ key: string; blob: Blob }, string>;
  journal!: Table<{ key: string; settings: Settings }, string>;
  constructor(name = 'SpeedDialX') {
    super(name);
    this.version(1).stores({ bookmarks: '++id,position', assets: 'key', journal: 'key' });
  }
}
export const db = new DialDatabase();
