import type { MessageKey, MessageText, MessageValue } from '../../../../../shared/i18n/contracts';
import type { AutoNameTicket, Bookmark, BookmarkAssets, BookmarkNode } from '../entities/models';

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
  getStored(bookmarkId: string, url: string): Promise<BookmarkAssets | undefined>;
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

export interface AutoNamesPort {
  get(id: string): Promise<AutoNameTicket | undefined>;
  put(value: AutoNameTicket): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  invalidate(id: string, change: { url?: string; title?: string }): Promise<void>;
}
export interface BookmarkPresentation {
  translate(key: MessageKey, params?: Record<string, MessageValue>): string;
  error(message: MessageText): Error;
}

export interface BookmarkSearchPort {
  search(query: string, cachedTabs?: Bookmark[]): Promise<Bookmark[]>;
}

export interface BookmarkSourcePort {
  readonly rootId: string | null;
  activeId: string | null;
  node(id: string): Promise<BookmarkNode>;
  bookmark(id: string): Promise<BookmarkNode>;
  parent(id?: string | null): Promise<BookmarkNode>;
  rootNode(): Promise<BookmarkNode>;
}
