import type { BookmarkNode } from '../../entities/models';

/** Native bookmark records may contain browser-specific fields outside our domain. */
export interface BookmarkNodeResponse {
  id: string;
  title: string;
  parentId?: string;
  url?: string;
  index?: number;
  type?: 'bookmark' | 'folder' | 'separator';
  children?: BookmarkNodeResponse[];
  unmodifiable?: string;
  folderType?: string;
  syncing?: boolean;
  dateAdded?: number;
  dateGroupModified?: number;
}

export function bookmarkNode(response: BookmarkNodeResponse): BookmarkNode {
  return {
    id: response.id,
    title: response.title,
    ...(response.parentId !== undefined ? { parentId: response.parentId } : {}),
    ...(response.url !== undefined ? { url: response.url } : {}),
    ...(response.index !== undefined ? { index: response.index } : {}),
    ...(response.type !== undefined ? { type: response.type } : {}),
    ...(response.unmodifiable !== undefined ? { unmodifiable: response.unmodifiable } : {}),
    ...(response.folderType !== undefined ? { folderType: response.folderType } : {}),
    ...(response.syncing !== undefined ? { syncing: response.syncing } : {}),
    ...(response.children ? { children: response.children.map(bookmarkNode) } : {}),
  };
}
