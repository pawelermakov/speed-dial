import type { BackgroundAsset } from '../entities/background';
export interface BackgroundStoragePort {
  get(): Promise<BackgroundAsset | undefined>;
  put(asset: BackgroundAsset): Promise<void>;
  remove(): Promise<void>;
}
export interface IAppearanceService {
  readStored(): Promise<BackgroundAsset | undefined>;
  save(blob: Blob | null): Promise<void>;
  restore(asset: BackgroundAsset | undefined): Promise<void>;
}

export interface BackgroundPresentationPort {
  createResource(
    publish: (url: string) => Promise<void>,
    preload: (url: string) => Promise<void>,
  ): {
    replace(blob: Blob | null): Promise<void>;
    dispose(): void;
  };
  cachePreview(image: HTMLImageElement): void;
  clearPreview(): void;
}
