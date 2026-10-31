import type { DialDatabase } from '../../shared/infrastructure/database';
import { withDataLock } from '../../shared/infrastructure/browser/dataLock';
import {
  createBookmarksModule,
  type BookmarksPort,
  type RootPort,
} from '../../modules/dial/modules/bookmarks';
import { createSettingsService, type SettingsPort } from '../../modules/dial/modules/settings';
import { createAppearanceService } from '../../modules/dial/modules/appearance';
import { createBackgroundStorage } from '../../modules/dial/modules/appearance/adapters/storage';
import { createBackupService } from '../../modules/dial/modules/backup/services/backup';
import { createSnapshotReader } from '../../modules/dial/services/snapshot';
import { t, LocalizedError, errorMessage } from '../../services/i18n';
import { normalizeUrl, validateSettings } from '../../services/validation';
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
  const backup = createBackupService({
    source: bookmarks.source,
    cache: bookmarks.actions.cache.bind(bookmarks.actions),
    bookmarks: nativeBookmarks,
    assets: bookmarks.assets,
    metadata: bookmarks.autoNames,
    settings,
    preferences,
    appearance,
    validate: validateSettings,
    error: (message) => new LocalizedError(message),
    errorText: errorMessage,
  });
  return { bookmarks, preferences, appearance, snapshots, backup };
}
export type DialFixture = ReturnType<typeof createDialFixture>;
