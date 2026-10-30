import Dexie, { type Table } from 'dexie';
import type { TileAssetRecord } from './models';
export class DialDatabase extends Dexie {
  autoNames!: Table<
    {
      bookmarkId: string;
      url: string;
      token: string;
      pendingEdit?: { url: boolean; title: boolean };
    },
    string
  >;
  tileAssets!: Table<TileAssetRecord, [string, string]>;
  assets!: Table<{ key: string; blob: Blob }, string>;
  constructor(name = 'SpeedDialX') {
    super(name);
    this.version(3).stores({
      assets: 'key',
      tileAssets: '[bookmarkId+url],bookmarkId',
      autoNames: 'bookmarkId',
    });
  }
}
