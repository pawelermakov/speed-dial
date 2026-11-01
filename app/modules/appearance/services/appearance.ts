import type { BackgroundAsset } from '../entities/background';
import type {
  BackgroundStoragePort,
  BackgroundPresentationPort,
  IAppearanceService,
} from './interfaces';

export class AppearanceService implements IAppearanceService {
  constructor(
    private readonly backgroundStorage: BackgroundStoragePort,
    public readonly presentation: BackgroundPresentationPort,
  ) {}

  readStored = () => this.backgroundStorage.get();
  save = async (blob: Blob | null) => {
    if (blob) await this.backgroundStorage.put({ key: 'background', blob });
    else await this.backgroundStorage.remove();
  };
  restore = async (asset: BackgroundAsset | undefined) => {
    if (asset) await this.backgroundStorage.put(asset);
    else await this.backgroundStorage.remove();
  };
}
