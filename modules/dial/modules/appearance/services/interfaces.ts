import type { BackgroundAsset } from '../entities/background';
export interface BackgroundStoragePort {
  get(): Promise<BackgroundAsset | undefined>;
  put(asset: BackgroundAsset): Promise<void>;
  remove(): Promise<void>;
}
export interface AppearanceService {
  readStored(): Promise<BackgroundAsset | undefined>;
  save(blob: Blob | null): Promise<void>;
  restore(asset: BackgroundAsset | undefined): Promise<void>;
}
