import type { MessageText } from '../../../common/i18n/contracts';

export interface Bookmark {
  id: string;
  parentId: string;
  url: string;
  title: string;
  index: number;
  favicon: Blob | null;
  thumbnail: Blob | null;
  thumbnailUpdatedAt?: number;
  faviconUpdatedAt?: number;
  faviconColor?: string;
}
export interface Folder {
  id: string;
  title: string;
  index: number;
  virtual?: boolean;
}
export interface FolderChoice {
  id: string;
  title: string;
  path: string;
  syncing?: boolean;
  standard: boolean;
  folderType?: string;
  writableChildren: boolean;
}
export interface BookmarkAssets {
  bookmarkId: string;
  url: string;
  thumbnail?: Blob;
  favicon?: Blob;
  faviconColor?: string | null;
  thumbnailUpdatedAt?: number;
  faviconUpdatedAt?: number;
}

export interface BookmarkNode {
  type?: 'bookmark' | 'folder' | 'separator';
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  index?: number;
  children?: BookmarkNode[];
  unmodifiable?: string;
  folderType?: string;
  syncing?: boolean;
}

export interface AutoNameTicket {
  bookmarkId: string;
  url: string;
  token: string;
  pendingEdit?: { url: boolean; title: boolean; previousUrl?: string; previousTitle?: string };
}
export interface BookmarksView {
  tabs: Bookmark[];
  folders: Folder[];
  rootId: string | null;
  activeId: string | null;
  rootNotice?: MessageText;
}

export interface BookmarkSearchView {
  tabs: Bookmark[];
  rootId: string | null;
}

export interface BookmarkGridOptions {
  width: number;
  countColumns: number;
  space: number;
  addButton: boolean;
}
