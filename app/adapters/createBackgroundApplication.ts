import { browser } from 'wxt/browser';
import { DialDatabase } from '../common/infrastructure/database';
import { withDataLock } from '../common/infrastructure/browser/dataLock';
import type { CaptureHandler } from '../modules/bookmarks';
import { New as createBackgroundBookmarksModule } from '../modules/bookmarks/background';
import { New as startSettingsSync } from '../modules/settings/background';

export function createBackgroundApplication(loadCapture?: () => Promise<CaptureHandler>) {
  const db = new DialDatabase();
  const sync = startSettingsSync(browser, withDataLock);
  const bookmarks = createBackgroundBookmarksModule({ browser, database: db, loadCapture });
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      bookmarks.dispose();
      sync.dispose();
      db.close();
    },
  };
}
