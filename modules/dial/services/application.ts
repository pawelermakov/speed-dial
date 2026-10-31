import type { SettingsPort, SettingsService } from '../modules/settings';
import type { RootPort, BookmarksModule } from '../modules/bookmarks';
import type { AppearanceService } from '../modules/appearance';
import type { SnapshotReader } from './snapshot';
import type { SyncClient } from '../modules/sync';
import type { DataLock } from '../../../shared/infrastructure/browser/interfaces';
import type { UpdatesPort } from './interfaces';

export interface DialSourcePort {
  readonly rootId: string | null;
  clearSourceNotice?(): void;
  selectRoot(id: string): Promise<void>;
  adoptRoot(id: string | null): Promise<void>;
}
export interface RootStoragePort extends RootPort {
  watch(callback: (id: string | null) => void | Promise<void>): () => void;
}
export interface DialEventsPort {
  readonly available: boolean;
  subscribe(listener: (assetsOnly: boolean) => void): () => void;
  dispose(): void;
}
export interface DialDependencies {
  bookmarks: { source: DialSourcePort; actions: Pick<BookmarksModule['actions'], 'cache'> };
  snapshots: SnapshotReader;
  preferences: Pick<SettingsService, 'patchSettings'>;
  appearance: Pick<AppearanceService, 'save'>;
  settings: SettingsPort;
  root: RootStoragePort;
  lock: DataLock;
  syncRequest: SyncClient;
  updates: UpdatesPort;
  events: DialEventsPort;
  readBackground(): Promise<Blob | null>;
  faviconBlob(url: string): Promise<Blob | null>;
}
