import type { BackupPorts } from './services/interfaces';
import { validateSettings } from '../settings/schema';
import { LocalizedError, errorMessage } from '../../common/i18n/errors';
import { BackupService } from './services/backup';

export interface BackupDependencies {
  bookmarks: {
    source: BackupPorts['source'];
    data: BackupPorts['data'];
    actions: { cache: BackupPorts['cache'] };
  };
  settings: BackupPorts['settings'];
  appearance: BackupPorts['appearance'];
}

export function New({ bookmarks, settings, appearance }: BackupDependencies) {
  return new BackupService({
    source: bookmarks.source,
    cache: bookmarks.actions.cache.bind(bookmarks.actions),
    data: bookmarks.data,
    settings,
    appearance,
    validate: validateSettings,
    error: (message) => new LocalizedError(message),
    errorText: errorMessage,
  });
}

export * from './entities';
export * from './services';
