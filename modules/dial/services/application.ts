import type { Snapshot } from '../entities/models';
import type { Settings, SettingsPort } from '../modules/settings';
import type { RootPort } from '../modules/bookmarks';
import type { SyncClient } from '../modules/sync';
import type { DataLock } from '../../../shared/infrastructure/browser/interfaces';
import type { UpdatesPort } from './interfaces';

// Temporary facade contract while Repository is extracted in stages 3–5.
export interface DialRepositoryPort {
  readonly rootId: string | null;
  load(includeBackground?: boolean): Promise<Snapshot>;
  initialize(): Promise<Snapshot>;
  clearSourceNotice?(): void;
  patchSettings(patch: Partial<Settings>): Promise<Settings>;
  selectRoot(id: string): Promise<void>;
  adoptRoot(id: string | null): Promise<void>;
  saveBackground(blob: Blob | null): Promise<void>;
  cache(id: string, url: string, resource: 'favicon' | 'thumbnail', blob: Blob): Promise<void>;
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
  repository: DialRepositoryPort;
  settings: SettingsPort;
  root: RootStoragePort;
  lock: DataLock;
  syncRequest: SyncClient;
  updates: UpdatesPort;
  events: DialEventsPort;
  readBackground(): Promise<Blob | null>;
  faviconBlob(url: string): Promise<Blob | null>;
}
