import type { BookmarkAssets, BookmarkNode } from '../entities/models';

export interface BookmarksPort {
  get(id: string): Promise<BookmarkNode[]>;
  getTree(): Promise<BookmarkNode[]>;
  getSubTree(id: string): Promise<BookmarkNode[]>;
  getChildren(id: string): Promise<BookmarkNode[]>;
  create(value: { parentId: string; title: string; url?: string }): Promise<BookmarkNode>;
  update(id: string, value: { title?: string; url?: string }): Promise<BookmarkNode>;
  move(id: string, value: { parentId?: string; index?: number }): Promise<BookmarkNode>;
  remove(id: string): Promise<void>;
  removeTree(id: string): Promise<void>;
}
export interface RootPort {
  getValue(): Promise<string | null>;
  setValue(value: string): Promise<void>;
}

export interface AssetsPort {
  get(bookmarkId: string, url: string): Promise<BookmarkAssets | undefined>;
  getMany(keys: Array<[string, string]>): Promise<Array<BookmarkAssets | undefined>>;
  put(
    bookmarkId: string,
    url: string,
    resource: 'thumbnail' | 'favicon',
    blob: Blob,
  ): Promise<void>;
  remove(bookmarkId: string): Promise<void>;
  clear(): Promise<void>;
}
