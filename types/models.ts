// Compatibility exports during stages 1–7. Remove in stage 8 after callers migrate.
export {
  searchProviderIds,
  movieProviderIds,
  isMovieProvider,
  type SearchProviderId,
  type SearchSuggestion,
} from '../modules/dial/modules/search';
export { themeModes, type ThemeMode } from '../modules/dial/modules/appearance';
export { defaults, type Settings } from '../modules/dial/modules/settings';
export type {
  Bookmark,
  Folder,
  FolderChoice,
  BookmarkAssets,
} from '../modules/dial/modules/bookmarks';
export {
  allBackupSections,
  type BackupBookmark,
  type BackupSelection,
  type ImportData,
  type PreparedExport,
  type ImportReport,
} from '../modules/dial/modules/backup';
export type { CaptureRequest, CaptureResponse } from '../modules/dial/modules/capture';
export type { Snapshot } from '../modules/dial';
