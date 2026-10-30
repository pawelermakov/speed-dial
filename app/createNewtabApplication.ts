import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { DialDatabase } from '../shared/infrastructure/database';
import { withDataLock } from '../shared/infrastructure/browser/dataLock';
import { createSettingsStorage } from '../modules/dial/modules/settings/adapters/storage';
import { createUpdatesChannel } from '../modules/dial/adapters/updates';
import { createBrowserEvents } from '../modules/dial/adapters/browserEvents';
import { Repository } from '../services/repository';
import { syncRequest } from '../services/syncClient';
import { faviconBlob } from '../services/favicons';
import type { DialDependencies } from '../modules/dial/services/application';

export function createNewtabApplication() {
  const db = new DialDatabase();
  const settings = createSettingsStorage(syncRequest);
  const root = storage.defineItem<string>('local:rootFolderId');
  const repository = new Repository(db, settings, browser.bookmarks, root);
  const updates = createUpdatesChannel();
  const events = createBrowserEvents(browser);
  let disposed = false;
  return {
    repository,
    settings,
    root,
    updates,
    events,
    lock: withDataLock,
    syncRequest,
    faviconBlob,
    async readBackground() {
      return (await db.assets.get('background'))?.blob ?? null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      events.dispose();
      updates.dispose();
      db.close();
    },
  } satisfies DialDependencies & { dispose(): void };
}
export type NewtabApplication = ReturnType<typeof createNewtabApplication>;
