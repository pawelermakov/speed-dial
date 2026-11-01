import { AppearanceService } from './services/appearance';
import type { DialDatabase } from '../../common/infrastructure/database';
import { BackgroundStorage } from './adapters/storage';
import { BackgroundResource } from './adapters/backgroundResource';
import { cacheBackgroundPreview, clearBackgroundPreview } from './adapters/backgroundPreview';

export function New(database: DialDatabase) {
  return new AppearanceService(new BackgroundStorage(database), {
    createResource: (
      publish: (url: string) => Promise<void>,
      preload: (url: string) => Promise<void>,
    ) => new BackgroundResource(publish, preload),
    cachePreview: cacheBackgroundPreview,
    clearPreview: clearBackgroundPreview,
  });
}

export * from './entities';
export * from './services';
