export const searchProviderIds = ['yandex', 'google', 'kinopoisk', 'imdb', 'myshows'] as const;
export type SearchProviderId = typeof searchProviderIds[number];
export interface SearchSuggestion { id: string; label: string; subtitle?: string; targetUrl?: string }
export interface Settings { width: number; countColumns: number; space: number; verticalCenter: boolean; addButton: boolean; bookmarkSearch: boolean; searchProvider: SearchProviderId; email: string }
export interface Bookmark { id: string; parentId: string; url: string; title: string; index: number; favicon: Blob | null; thumbnail: Blob | null; thumbnailUpdatedAt?: number; faviconUpdatedAt?: number; faviconColor?: string }
export interface Folder { id: string; title: string; index: number; virtual?: boolean }
export interface FolderChoice { id: string; title: string; path: string; syncing?: boolean; standard: boolean; folderType?: string; writableChildren: boolean }
export interface Snapshot { tabs: Bookmark[]; folders: Folder[]; rootId: string | null; activeId: string | null; settings: Settings; background: Blob | null; rootNotice?: string }
export interface BookmarkAssets { bookmarkId: string; url: string; thumbnail?: Blob; favicon?: Blob; faviconColor?: string | null; thumbnailUpdatedAt?: number; faviconUpdatedAt?: number }
export interface ImportData { entries: Array<{ title: string; url: string } | { title: string; children: Array<{ title: string; url: string }> }>; settings: Settings; background: Blob | null }
export interface CaptureRequest { type: 'capture'; requestId: string; url: string }
export interface CaptureResponse { requestId: string; title?: string; favicon?: string; thumbnail?: string; error?: string }
export const defaults: Settings = { width: 100, countColumns: 6, space: 24, verticalCenter: false, addButton: false, bookmarkSearch: true, searchProvider: 'yandex', email: '' };
