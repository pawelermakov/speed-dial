import type { IBookmarksSource } from './interfaces';
import { message } from '../../../common/i18n/messages';
import type { MessageText } from '../../../common/i18n/contracts';
import type { Bookmark, BookmarkNode, FolderChoice, BookmarksView } from '../entities/models';
import type { AssetsPort, BookmarksPort, RootPort, BookmarkPresentation } from './interfaces';
import { isBookmark, isFolder, folderChoices, defaultFolderId } from '../helpers/folders';
export class BookmarksSource implements IBookmarksSource {
  rootId: string | null = null;
  activeId: string | null = null;
  private readGeneration = 0;
  private sourceNotice: MessageText | undefined;
  clearSourceNotice() {
    this.sourceNotice = undefined;
  }
  selectFolder(id: string) {
    this.readGeneration++;
    this.activeId = id;
  }
  watchRoot: IBookmarksSource['watchRoot'] = (callback) =>
    this.root.watch?.(callback) ?? (() => {});
  constructor(
    private readonly bookmarks: BookmarksPort,
    private root: RootPort,
    private images: AssetsPort,
    private presentation: BookmarkPresentation,
  ) {}
  async choices() {
    return folderChoices(await this.bookmarks.getTree(), this.presentation.translate);
  }
  async node(id: string) {
    const node = (await this.bookmarks.get(id))[0];
    if (!node) throw this.presentation.error(message('bookmarks.errors.item_missing'));
    return node;
  }
  async folder(id: string) {
    const choices = await this.choices();
    if (!choices.some((choice) => choice.id === id))
      throw this.presentation.error(message('bookmarks.source.unavailable_choose_another'));
    return this.node(id);
  }
  async adoptRoot(id: string | null) {
    const previous = this.rootId;
    this.readGeneration++;
    this.rootId = id;
    this.activeId = null;
    const choices = await this.choices();
    const selected = choices.find((choice) => choice.id === id);
    if (id && !selected) throw this.presentation.error(message('bookmarks.source.unavailable'));
    if (previous && selected && !choices.some((choice) => choice.id === previous))
      this.sourceNotice = message('bookmarks.source.fallback_named', {
        folder_name: selected.path,
      });
  }
  async selectRoot(id: string) {
    await this.folder(id);
    if ((await this.root.getValue()) !== id) await this.root.setValue(id);
    this.readGeneration++;
    const changed = this.rootId !== id;
    this.rootId = id;
    this.sourceNotice = undefined;
    if (changed) this.activeId = null;
  }
  async initialize() {
    this.rootId = await this.root.getValue();
    this.activeId = null;
  }
  async rootNode() {
    if (!this.rootId) throw this.presentation.error(message('bookmarks.source.choose_in_settings'));
    return this.folder(this.rootId);
  }
  async parent(id = this.activeId ?? this.rootId) {
    const root = await this.rootNode();
    if (id === root.id) return root;
    if (!id) throw this.presentation.error(message('folders.errors.none_selected'));
    const node = await this.node(id);
    if (!isFolder(node) || node.unmodifiable || node.folderType || node.parentId !== root.id)
      throw this.presentation.error(message('folders.errors.source_moved_or_deleted'));
    return node;
  }
  async bookmark(id: string) {
    const node = await this.node(id);
    if (!isBookmark(node) || node.unmodifiable || !node.parentId)
      throw this.presentation.error(message('bookmarks.errors.unavailable'));
    await this.parent(node.parentId);
    return node;
  }
  async search(query: string, cachedTabs: Bookmark[] = []): Promise<Bookmark[]> {
    const text = query.trim().toLocaleLowerCase();
    const rootId = this.rootId;
    if (!text || !rootId) return [];
    const tree = await this.bookmarks.getSubTree(rootId);
    const root = tree[0];
    if (!root || root.unmodifiable)
      throw this.presentation.error(message('bookmarks.source.unavailable'));
    const children = root.children ?? [];
    const rows = children.flatMap((node) =>
      isBookmark(node) ? [node] : (node.children ?? []).filter(isBookmark),
    );
    return this.withAssets(
      rows.filter((node) => (node.title + '\n' + node.url).toLocaleLowerCase().includes(text)),
      cachedTabs,
    );
  }
  private async withAssets(
    nodes: BookmarkNode[],
    cachedTabs: Bookmark[] = [],
  ): Promise<Bookmark[]> {
    const cached = new Map(cachedTabs.map((tab) => [tab.id, tab]));
    const missing = nodes.filter((node) => cached.get(node.id)?.url !== node.url);
    const assets = await this.images.getMany(missing.map((node) => [node.id, node.url!]));
    const fetched = new Map(missing.map((node, index) => [node.id, assets[index]]));
    return nodes.map((node) => {
      const url = node.url!,
        previous = cached.get(node.id);
      const cache = previous?.url === url ? previous : fetched.get(node.id);
      return {
        id: node.id,
        parentId: node.parentId!,
        url,
        title: node.title || url,
        index: node.index ?? 0,
        thumbnail: cache?.thumbnail ?? null,
        favicon: cache?.favicon ?? null,
        faviconColor: cache?.faviconColor ?? undefined,
        thumbnailUpdatedAt: cache?.thumbnailUpdatedAt,
        faviconUpdatedAt: cache?.faviconUpdatedAt,
      };
    });
  }
  prepareRead() {
    const generation = ++this.readGeneration;
    const initialRoot = this.rootId;
    let rootId = initialRoot,
      activeId = this.activeId;
    // Complete only after the parent snapshot's settings/background reads succeeded.
    return async (choices: FolderChoice[]): Promise<BookmarksView> => {
      let rootNotice = this.sourceNotice;
      if (!rootId || !choices.some((choice) => choice.id === rootId)) {
        rootId = defaultFolderId(choices);
        activeId = null;
        if (rootId && generation === this.readGeneration && initialRoot === this.rootId) {
          await this.root.setValue(rootId);
          if (initialRoot)
            rootNotice = this.sourceNotice = message('bookmarks.source.fallback_other');
        }
      }
      let tabs: Bookmark[] = [],
        folders: BookmarksView['folders'] = [];
      if (rootId) {
        const children = await this.bookmarks.getChildren(rootId);
        const childFolders = children.filter((node) => isFolder(node) && !node.unmodifiable);
        const rootTitle = choices.find((choice) => choice.id === rootId)!.title;
        folders = [
          { id: rootId, title: rootTitle, index: -1, virtual: true },
          ...childFolders.map((node) => ({
            id: node.id,
            title:
              node.title === rootTitle
                ? this.presentation.translate('folders.display.duplicate_root_name', {
                    folder_name: rootTitle,
                  })
                : node.title,
            index: node.index ?? 0,
          })),
        ];
        if (
          !activeId ||
          (folders.length ? !folders.some((node) => node.id === activeId) : activeId !== rootId)
        )
          activeId = folders[0]?.id ?? rootId;
        const nodes = activeId === rootId ? children : await this.bookmarks.getChildren(activeId);
        tabs = await this.withAssets(nodes.filter(isBookmark));
      }
      if (generation === this.readGeneration && initialRoot === this.rootId) {
        this.rootId = rootId;
        this.activeId = activeId;
      }

      return { tabs, folders, rootId, activeId, rootNotice };
    };
  }
}
