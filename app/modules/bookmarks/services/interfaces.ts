import type { CaptureRequest, CaptureResponse } from '../entities/capture';
import type { MessageKey, MessageText, MessageValue } from '../../../common/i18n/contracts';
import type { DataLock } from '../../../common/infrastructure/browser/interfaces';
import type {
  AutoNameTicket,
  Bookmark,
  BookmarkAssets,
  BookmarkNode,
  FolderChoice,
  BookmarksView,
} from '../entities/models';

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
  watch?(callback: (id: string | null) => void | Promise<void>): () => void;
}

export interface BookmarksDataPort {
  getChildren: BookmarksPort['getChildren'];
  create: BookmarksPort['create'];
  readAssets: AssetsPort['getStored'];
  clearAssets: AssetsPort['clear'];
  readAutoName: AutoNamesPort['get'];
  saveAutoName: AutoNamesPort['put'];
  clearAutoNames: AutoNamesPort['clear'];
}

export interface IBookmarkCaptureService {
  updateImages(id: string, url: string, completion: CaptureCompletion): Promise<void>;
  dispose(): void;
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

export interface CaptureHandler {
  (request: CaptureRequest, originTab: number, cancellation: AbortSignal): Promise<CaptureResponse>;
}
export interface CaptureResult {
  title: string;
  favicon: string;
  thumbnail: Blob;
}
export interface CaptureClient {
  requestThumbnail(url: string): Promise<CaptureResult>;
  dispose(): void;
}
export interface CaptureCompletion {
  refresh(): Promise<unknown>;
  announce(): void;
}

export interface IBookmarksSource extends BookmarkSourcePort, BookmarkSearchPort {
  watchRoot(callback: (id: string | null) => void | Promise<void>): () => void;
  clearSourceNotice(): void;
  selectFolder(id: string): void;
  choices(): Promise<FolderChoice[]>;
  folder(id: string): Promise<BookmarkNode>;
  adoptRoot(id: string | null): Promise<void>;
  selectRoot(id: string): Promise<void>;
  initialize(): Promise<void>;
  prepareRead(): (choices: FolderChoice[]) => Promise<BookmarksView>;
}
export interface IBookmarkActions {
  add(input: { url: string; title: string; parentId?: string }): Promise<string>;
  edit(input: EditBookmarkInput): Promise<boolean>;
  autoNameTicket(id: string): Promise<AutoNameTicket | undefined>;
  applyCapturedTitle(
    id: string,
    url: string,
    title: string,
    ticket: AutoNameTicket | undefined,
  ): Promise<void>;
  cache(
    id: string,
    url: string,
    resource: 'thumbnail' | 'favicon',
    blob: Blob,
    expected?: { title: string; parentId?: string },
  ): Promise<void>;
  remove(id: string): Promise<void>;
  reorder(ids: string[], expected?: string[], parentId?: string | null): Promise<void>;
  reorderFolders(ids: string[], expected?: string[]): Promise<void>;
  createFolder(title: string): Promise<void>;
  childFolder(id: string): Promise<BookmarkNode>;
  renameFolder(id: string, title: string): Promise<void>;
  removeFolder(id: string): Promise<void>;
  moveFolder(id: string, beforeId: string): Promise<void>;
}
export interface EditBookmarkInput {
  id: string;
  url: string;
  title: string;
  parentId?: string;
  titleEdited?: boolean;
  expected?: { url: string; title: string; parentId: string };
}
export interface BookmarkActionsDependencies {
  source: BookmarkSourcePort;
  api: BookmarksPort;
  assets: Pick<AssetsPort, 'put' | 'remove'>;
  metadata: Pick<AutoNamesPort, 'get' | 'put' | 'delete'>;
  presentation: BookmarkPresentation;
  normalizeUrl(input: unknown): string;
  lock: DataLock;
  moveIndex(from: number, to: number): number;
}
export interface BookmarksRuntimePorts {
  loadCapture(
    faviconBlob: (url: string, hint?: string) => Promise<Blob | null>,
  ): Promise<IBookmarkCaptureService>;
  faviconBlob(url: string, hint: string | undefined, signal: AbortSignal): Promise<Blob | null>;
}

export interface BookmarkCaptureDependencies {
  source: Pick<IBookmarksSource, 'bookmark'>;
  actions: Pick<IBookmarkActions, 'autoNameTicket' | 'cache' | 'applyCapturedTitle'>;
  client: CaptureClient;
  faviconBlob(url: string, hint?: string): Promise<Blob | null>;
  error(message: MessageText): Error;
}
