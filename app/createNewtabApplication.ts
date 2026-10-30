import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { DialDatabase } from '../shared/infrastructure/database';
import { withDataLock } from '../shared/infrastructure/browser/dataLock';
import { createSettingsStorage } from '../modules/dial/modules/settings/adapters/storage';
import { createUpdatesChannel } from '../modules/dial/adapters/updates';
import { createBrowserEvents } from '../modules/dial/adapters/browserEvents';
import { Repository } from '../services/repository';
import { createBookmarksModule } from '../modules/dial/modules/bookmarks';
import { t, LocalizedError } from '../services/i18n';
import { normalizeUrl } from '../services/validation';
import { syncRequest } from '../services/syncClient';
import { faviconBlob } from '../services/favicons';
import type { DialDependencies } from '../modules/dial/services/application';

export function createNewtabApplication() {
  const db = new DialDatabase();
  const settings = createSettingsStorage(syncRequest);
  const root = storage.defineItem<string>('local:rootFolderId');
  const bookmarks = createBookmarksModule({
    database: db,
    bookmarks: browser.bookmarks,
    root,
    lock: withDataLock,
    normalizeUrl,
    presentation: { translate: t, error: (message) => new LocalizedError(message) },
  });
  const repository = new Repository(db, settings, browser.bookmarks, root, bookmarks);
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
