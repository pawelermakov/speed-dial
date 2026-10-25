import type { WeatherCityId, WeatherProvider } from '../utils/weather';
export const searchProviderIds = ['yandex', 'google', 'kinopoisk', 'imdb', 'myshows', 'bookmarks'] as const;
export const movieProviderIds = ['kinopoisk', 'imdb', 'myshows'] as const;
export const isMovieProvider = (provider: unknown): boolean => movieProviderIds.includes(provider as typeof movieProviderIds[number]);
export type SearchProviderId = typeof searchProviderIds[number];
export interface SearchSuggestion { id: string; label: string; subtitle?: string; targetUrl?: string }
export const themeModes = ['system', 'light', 'dark'] as const;
export type ThemeMode = typeof themeModes[number];
export interface Settings { weatherEnabled:boolean; weatherCity:WeatherCityId; weatherProvider:WeatherProvider; theme: ThemeMode; width: number; countColumns: number; space: number; verticalCenter: boolean; addButton: boolean; bookmarkSearch: boolean; movieSearch: boolean; searchProvider: SearchProviderId; email: string }
export interface Bookmark { id: string; parentId: string; url: string; title: string; index: number; favicon: Blob | null; thumbnail: Blob | null; thumbnailUpdatedAt?: number; faviconUpdatedAt?: number; faviconColor?: string }
export interface Folder { id: string; title: string; index: number; virtual?: boolean }
export interface FolderChoice { id: string; title: string; path: string; syncing?: boolean; standard: boolean; folderType?: string; writableChildren: boolean }
export interface Snapshot { tabs: Bookmark[]; folders: Folder[]; rootId: string | null; activeId: string | null; settings: Settings; background: Blob | null; rootNotice?: string }
export interface BookmarkAssets { bookmarkId: string; url: string; thumbnail?: Blob; favicon?: Blob; faviconColor?: string | null; thumbnailUpdatedAt?: number; faviconUpdatedAt?: number }
export interface BackupBookmark { title: string; url: string; thumbnail?: Blob; favicon?: Blob; autoName?: true }
export interface BackupSelection { bookmarks:boolean; images:boolean; settings:boolean; background:boolean }
export const allBackupSections:BackupSelection={bookmarks:true,images:true,settings:true,background:true};
export interface ImportData { bookmarks?:false; entries: Array<BackupBookmark | { title: string; children: BackupBookmark[] }>; settings?: Settings; background?: Blob | null }
export interface PreparedExport { data:ImportData; warnings:string[] }
export interface ImportReport { bookmarks: number; folders: number; images: number; settings?:true; background?:true; skipped?:number; warnings: string[]; error?: string }
export interface CaptureRequest { type: 'capture'; requestId: string; url: string }
export interface CaptureResponse { requestId: string; title?: string; favicon?: string; thumbnail?: string; error?: string }
export const defaults: Settings = { weatherEnabled:false, weatherCity:'moscow', weatherProvider:'yandex', theme: 'system', width: 100, countColumns: 6, space: 24, verticalCenter: false, addButton: false, bookmarkSearch: true, movieSearch: false, searchProvider: 'yandex', email: '' };
