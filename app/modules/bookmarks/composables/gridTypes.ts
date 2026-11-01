import type { Bookmark, BookmarkGridOptions } from '../entities/models';
export interface BookmarkGridProps {
  contextId?: string;
  revision?: number;
  motionEnabled: boolean;
  folderId?: string | null;
  tabs: Bookmark[];
  settings: BookmarkGridOptions;
  disabled: boolean;
  searching?: boolean;
  folderNames?: Record<string, string>;
}
