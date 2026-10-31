import { browser } from 'wxt/browser';
import { createLazyLoader } from '../shared/helpers/lazy';
import { storage } from 'wxt/utils/storage';
import { DialDatabase } from '../shared/infrastructure/database';
import { withDataLock } from '../shared/infrastructure/browser/dataLock';
import { createSettingsStorage } from '../modules/dial/modules/settings/adapters/storage';
import { createUpdatesChannel } from '../modules/dial/adapters/updates';
import { createBrowserEvents } from '../modules/dial/adapters/browserEvents';
import { Repository } from '../services/repository';
import { createBookmarksModule } from '../modules/dial/modules/bookmarks';
import { t, LocalizedError } from '../services/i18n';
import { normalizeUrl, validateSettings } from '../services/validation';
import { errorMessage } from '../services/i18n';
import { createSettingsService } from '../modules/dial/modules/settings';
import { createAppearanceService } from '../modules/dial/modules/appearance';
import { createBackgroundStorage } from '../modules/dial/modules/appearance/adapters/storage';
import { createSyncClient } from '../modules/dial/modules/sync';
import { createBrowserSyncTransport } from '../modules/dial/modules/sync/adapters/browserClient';
import { createSyncStateStorage } from '../modules/dial/modules/sync/adapters/statusStorage';
import { syncStatus } from '../modules/dial/modules/sync/adapters/accountStatus';
import { faviconBlob } from '../services/favicons';
import { createSearchModule } from '../modules/dial/modules/search/newtab';
import { createMailModule } from '../modules/dial/modules/mail/newtab';
import type { DialDependencies } from '../modules/dial/services/application';

export function createNewtabApplication() {
  const db = new DialDatabase();
  const syncRequest = createSyncClient(createBrowserSyncTransport(browser));
  const syncState = createSyncStateStorage();
  const settings = createSettingsStorage((patch) => {
    void syncRequest('patch', patch);
  });
  const root = storage.defineItem<string>('local:rootFolderId');
  const bookmarks = createBookmarksModule({
    database: db,
    bookmarks: browser.bookmarks,
    root,
    lock: withDataLock,
    normalizeUrl,
    presentation: { translate: t, error: (message) => new LocalizedError(message) },
  });
  const appearance = createAppearanceService(createBackgroundStorage(db));
  const preferences = createSettingsService({
    storage: settings,
    background: appearance,
    source: bookmarks.source,
    validate: validateSettings,
    error: (message) => new LocalizedError(message),
    errorText: errorMessage,
  });
  const repository = new Repository(db, settings, browser.bookmarks, root, bookmarks, {
    settings: preferences,
    appearance,
  });
  const updates = createUpdatesChannel();
  const events = createBrowserEvents(browser);
  const backupUI = createLazyLoader(() => import('../modules/dial/modules/backup/newtab'));
  const captureUI = createLazyLoader(
    () =>
      import('../modules/dial/modules/capture/newtab').then((module) =>
        module.createCaptureModule({ bookmarks: repository, faviconBlob }),
      ),
    (module) => module.dispose(),
  );
  let disposed = false;
  const search = createSearchModule();
  const application = {
    search,
    mail: createMailModule(),
    syncState,
    getSyncStatus: () => syncStatus(),
    repository,
    getBackup: () => backupUI.get(),
    getCapture: () => captureUI.get(),
    settings,
    root,
    updates,
    events,
    lock: withDataLock,
    syncRequest,
    faviconBlob,
    async readBackground() {
      return (await appearance.readStored())?.blob ?? null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      search.dispose();
      captureUI.dispose();
      backupUI.dispose();
      repository.dispose();
      events.dispose();
      updates.dispose();
      db.close();
    },
  };
  return application satisfies DialDependencies & { dispose(): void };
}
export type NewtabApplication = ReturnType<typeof createNewtabApplication>;
