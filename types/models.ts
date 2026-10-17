export interface Settings { width: number; countColumns: number; space: number; verticalCenter: boolean; addButton: boolean; email: string }
export interface Bookmark { id: string; parentId: string; url: string; title: string; index: number; favicon: Blob | null; thumbnail: Blob | null; thumbnailUpdatedAt?: number; faviconUpdatedAt?: number; faviconColor?: string }
export interface Category { id: string; title: string; index: number; virtual?: boolean }
export interface FolderChoice { id: string; path: string; syncing?: boolean; standard?: boolean }
export interface Snapshot { tabs: Bookmark[]; categories: Category[]; rootId: string | null; activeId: string | null; settings: Settings; background: Blob | null }
export interface BookmarkAssets { bookmarkId: string; url: string; thumbnail?: Blob; favicon?: Blob; faviconColor?: string | null; faviconColorVersion?: number; thumbnailUpdatedAt?: number; faviconUpdatedAt?: number }
export interface ImportData { entries: Array<{ title: string; url: string } | { title: string; children: Array<{ title: string; url: string }> }>; settings: Settings; background: Blob | null }
export interface CaptureRequest { type: 'capture'; requestId: string; url: string }
export interface CaptureResponse { requestId: string; title?: string; favicon?: string; thumbnail?: string; error?: string }
export const defaults: Settings = { width: 100, countColumns: 6, space: 24, verticalCenter: false, addButton: false, email: '' };
