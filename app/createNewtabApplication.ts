import { createTranslationContext } from '../shared/i18n';
import { browser } from 'wxt/browser';
import { createLazyLoader } from '../shared/helpers/lazy';
import { storage } from 'wxt/utils/storage';
import { DialDatabase } from '../shared/infrastructure/database';
import { withDataLock } from '../shared/infrastructure/browser/dataLock';
import { createSettingsStorage } from '../modules/dial/modules/settings/adapters/storage';
import { createUpdatesChannel } from '../modules/dial/adapters/updates';
import { createBrowserEvents } from '../modules/dial/adapters/browserEvents';
import { createSnapshotReader } from '../modules/dial/services/snapshot';
import type { CaptureBookmarksPort } from '../modules/dial/modules/capture';
import { createBookmarksModule } from '../modules/dial/modules/bookmarks';
import { LocalizedError } from '../shared/i18n/errors';
import { normalizeUrl, validateSettings } from '../services/validation';
import { errorMessage } from '../shared/i18n/errors';
import { createSettingsService } from '../modules/dial/modules/settings';
import { createAppearanceService } from '../modules/dial/modules/appearance';
import { createBackgroundStorage } from '../modules/dial/modules/appearance/adapters/storage';
import { BackgroundResource } from '../modules/dial/modules/appearance/adapters/backgroundResource';
import {
  cacheBackgroundPreview,
  clearBackgroundPreview,
} from '../modules/dial/modules/appearance/adapters/backgroundPreview';
import { createSyncClient } from '../modules/dial/modules/sync';
import { createBrowserSyncTransport } from '../modules/dial/modules/sync/adapters/browserClient';
import { createSyncStateStorage } from '../modules/dial/modules/sync/adapters/statusStorage';
import { syncStatus } from '../modules/dial/modules/sync/adapters/accountStatus';
import { faviconBlob } from '../services/favicons';
import { createSearchModule } from '../modules/dial/modules/search/newtab';
import { createMailModule } from '../modules/dial/modules/mail/newtab';
import type { DialDependencies } from '../modules/dial/services/application';

export function createNewtabApplication(translations = createTranslationContext()) {
  const { t } = translations;
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
  const snapshots = createSnapshotReader({
    source: bookmarks.source,
    settings,
    appearance,
    validate: validateSettings,
  });
  const captureBookmarks: CaptureBookmarksPort = {
    autoNameTicket: bookmarks.actions.autoNameTicket.bind(bookmarks.actions),
    bookmark: bookmarks.source.bookmark.bind(bookmarks.source),
    cache: bookmarks.actions.cache.bind(bookmarks.actions),
    applyCapturedTitle: bookmarks.actions.applyCapturedTitle.bind(bookmarks.actions),
  };
  const backupService = createLazyLoader(async () => {
    const { createBackupService } = await import('../modules/dial/modules/backup/services/backup');
    return createBackupService({
      source: bookmarks.source,
      cache: captureBookmarks.cache,
      bookmarks: bookmarks.bookmarks,
      assets: bookmarks.assets,
      metadata: bookmarks.autoNames,
      settings,
      preferences,
      appearance,
      validate: validateSettings,
      error: (message) => new LocalizedError(message),
      errorText: errorMessage,
    });
  });
  const updates = createUpdatesChannel();
  const events = createBrowserEvents(browser);
  const backupUI = createLazyLoader(() => import('../modules/dial/modules/backup/newtab'));
  const captureUI = createLazyLoader(
    () =>
      import('../modules/dial/modules/capture/newtab').then((module) =>
        module.createCaptureModule({ bookmarks: captureBookmarks, faviconBlob }),
      ),
    (module) => module.dispose(),
  );
  let disposed = false;
  const search = createSearchModule(t);
  const application = {
    openTab: async (url: string) => {
      await browser.tabs.create({ url });
    },
    backgroundPresentation: {
      createResource: (
        publish: (url: string) => Promise<void>,
        preload: (url: string) => Promise<void>,
      ) => new BackgroundResource(publish, preload),
      cachePreview: cacheBackgroundPreview,
      clearPreview: clearBackgroundPreview,
    },
    translations,
    search,
    mail: createMailModule(),
    syncState,
    getSyncStatus: () => syncStatus(),
    bookmarks,
    snapshots,
    preferences,
    appearance,
    captureBookmarks,
    getBackupService: () => backupService.get(),
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
      backupService.dispose();
      events.dispose();
      updates.dispose();
      db.close();
      translations.dispose();
    },
  };
  return application satisfies DialDependencies & { dispose(): void };
}
export type NewtabApplication = ReturnType<typeof createNewtabApplication>;
