import type { DialDatabase } from '../../../../../shared/infrastructure/database';
import type { BackgroundStoragePort } from '../services/interfaces';
export function createBackgroundStorage(db: DialDatabase): BackgroundStoragePort {
  return {
    get: () => db.assets.get('background'),
    async put(asset) {
      await db.assets.put(asset);
    },
    async remove() {
      await db.assets.delete('background');
    },
  };
}
