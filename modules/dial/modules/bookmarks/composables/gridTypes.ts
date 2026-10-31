import type { Bookmark, Settings } from '../../../../../types/models';
export interface BookmarkGridProps {
  contextId?: string;
  revision?: number;
  motionEnabled: boolean;
  folderId?: string | null;
  tabs: Bookmark[];
  settings: Settings;
  disabled: boolean;
  searching?: boolean;
  folderNames?: Record<string, string>;
}
