// Persisted row contract of the shared v3 schema; feature adapters own domain models.
export interface TileAssetRecord {
  bookmarkId: string;
  url: string;
  thumbnail?: Blob;
  favicon?: Blob;
  faviconColor?: string | null;
  thumbnailUpdatedAt?: number;
  faviconUpdatedAt?: number;
}
