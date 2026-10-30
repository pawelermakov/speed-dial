import type { BackgroundStoragePort, AppearanceService } from './interfaces';
// Keep the port name distinct from WXT's storage capability (verified in bundle audit).
export function createAppearanceService(
  backgroundStorage: BackgroundStoragePort,
): AppearanceService {
  return {
    readStored: () => backgroundStorage.get(),
    async save(blob) {
      if (blob) await backgroundStorage.put({ key: 'background', blob });
      else await backgroundStorage.remove();
    },
    async restore(asset) {
      if (asset) await backgroundStorage.put(asset);
      else await backgroundStorage.remove();
    },
  };
}
