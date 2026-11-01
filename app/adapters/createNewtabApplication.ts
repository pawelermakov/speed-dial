import { createTranslationContext } from '../common/i18n';
import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { createLazyLoader } from '../common/helpers/lazy';
import { DialDatabase } from '../common/infrastructure/database';
import { withDataLock } from '../common/infrastructure/browser/dataLock';
import { createUpdatesChannel } from './updates';
import { createBrowserEvents } from './browserEvents';
import { createSnapshotReader } from '../services/snapshot';
import { New as NewBookmarks } from '../modules/bookmarks';
import { LocalizedError } from '../common/i18n/errors';
import { validateSettings } from '../modules/settings/schema';
import { New as NewAppearance } from '../modules/appearance';
import { New as NewSettings } from '../modules/settings';
import { New as NewSearch } from '../modules/search';
import { New as NewMail } from '../modules/mail';
import type { DialDependencies } from '../services/application';

export function createNewtabApplication(translations = createTranslationContext()) {
  const { t } = translations;
  const db = new DialDatabase();
  const bookmarks = NewBookmarks({
    database: db,
    bookmarks: browser.bookmarks,
    storage,
    lock: withDataLock,
    presentation: { translate: t, error: (message) => new LocalizedError(message) },
  });
  const appearance = NewAppearance(db);
  const settings = NewSettings({
    browser,
    storage,
    background: appearance,
    source: bookmarks.source,
  });
  const snapshots = createSnapshotReader({
    source: bookmarks.source,
    settings,
    appearance,
    validate: validateSettings,
  });
  const backupService = createLazyLoader(async () => {
    const { New } = await import('../modules/backup');
    return New({ bookmarks, settings, appearance });
  });
  const updates = createUpdatesChannel();
  const events = createBrowserEvents(browser);
  const backupUI = createLazyLoader(() => import('../modules/backup/newtab'));
  let disposed = false;
  const search = NewSearch({ translate: t });
  const mail = NewMail();
  const application = {
    openTab: async (url: string) => {
      await browser.tabs.create({ url });
    },
    translations,
    search,
    mail,
    bookmarks,
    snapshots,
    appearance,
    backup: { service: backupService.get, view: backupUI.get },
    settings,
    updates,
    events,
    lock: withDataLock,
    dispose() {
      if (disposed) return;
      disposed = true;
      search.dispose();
      mail.dispose();
      bookmarks.dispose();
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
