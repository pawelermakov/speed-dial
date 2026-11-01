import type { ISettingsService } from '../modules/settings';
import type { IBookmarkActions } from '../modules/bookmarks';
import type { IAppearanceService } from '../modules/appearance';
import type { SnapshotReader } from './snapshot';
import type { SyncClient } from '../modules/settings';
import type { DataLock } from '../common/infrastructure/browser/interfaces';
import type { UpdatesPort } from './interfaces';

export interface DialSourcePort {
  readonly rootId: string | null;
  clearSourceNotice?(): void;
  watchRoot(callback: (id: string | null) => void | Promise<void>): () => void;
  selectRoot(id: string): Promise<void>;
  adoptRoot(id: string | null): Promise<void>;
}
export interface DialEventsPort {
  readonly available: boolean;
  subscribe(listener: (assetsOnly: boolean) => void): () => void;
  dispose(): void;
}
export interface DialDependencies {
  bookmarks: {
    source: DialSourcePort;
    actions: Pick<IBookmarkActions, 'cache'>;
    faviconBlob(url: string): Promise<Blob | null>;
  };
  snapshots: SnapshotReader;
  appearance: Pick<IAppearanceService, 'save' | 'readStored'>;
  settings: Pick<ISettingsService, 'getValue' | 'watch' | 'patchSettings'> & {
    sync: { request: SyncClient };
  };
  lock: DataLock;
  updates: UpdatesPort;
  events: DialEventsPort;
}
