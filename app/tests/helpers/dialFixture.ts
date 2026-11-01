import type { DialDatabase } from '../../common/infrastructure/database';
import { withDataLock } from '../../common/infrastructure/browser/dataLock';
import { createBookmarksModule } from './bookmarks';
import { type BookmarksPort, type RootPort } from '../../modules/bookmarks';
import { createSettingsModule } from './settings';
import { type SettingsPort } from '../../modules/settings';
import { New as createAppearanceModule } from '../../modules/appearance';
import { New as createBackupModule } from '../../modules/backup';
import { createSnapshotReader } from '../../services/snapshot';
import { t } from './i18n';
import { LocalizedError, errorMessage } from '../../common/i18n/errors';
import { validateSettings } from '../../modules/settings/schema';
// Assemble the same feature implementations as production, without a legacy facade.
export function createDialFixture(
  db: DialDatabase,
  settings: SettingsPort,
  nativeBookmarks: BookmarksPort,
  root: RootPort,
) {
  const bookmarks = createBookmarksModule({
    database: db,
    bookmarks: nativeBookmarks,
    root,
    lock: withDataLock,
    presentation: { translate: t, error: (message) => new LocalizedError(message) },
  });
  const appearance = createAppearanceModule(db);
  const preferences = createSettingsModule({
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
  const backup = createBackupModule({ bookmarks, settings: preferences, appearance });
  return { bookmarks, preferences, appearance, snapshots, backup };
}
export type DialFixture = ReturnType<typeof createDialFixture>;
