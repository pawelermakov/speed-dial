import { BookmarkAssetStore } from './bookmarkAssets';
import type { DialDatabase } from './database';
import type { SettingsPort } from './settings';
import { defaults, type Bookmark, type Settings, type Snapshot, type ImportData, type SearchProviderId } from '../types/models';
import { normalizeUrl, validateSettings } from './validation';
import { folderChoices, defaultFolderId, type BookmarksPort, type RootPort, type BookmarkNode } from './bookmarks';
let localQueue:Promise<unknown>=Promise.resolve();
export async function withDataLock<T>(operation: () => Promise<T>): Promise<T> {
  if(navigator.locks)return navigator.locks.request('speed-dial-data', operation);
  const pending=localQueue.then(operation);localQueue=pending.catch(()=>{});return pending;
}
export class Repository {
  rootId: string | null = null;
  activeId: string | null = null;
  private readGeneration = 0;
  private sourceNotice: string | undefined;
  clearSourceNotice() { this.sourceNotice = undefined; }
  selectCategory(id:string) { this.readGeneration++;this.activeId=id; }
  private images: BookmarkAssetStore;
  constructor(private db: DialDatabase, private settings: SettingsPort, readonly bookmarks: BookmarksPort, private root: RootPort) { this.images = new BookmarkAssetStore(db); }
  async choices() { return folderChoices(await this.bookmarks.getTree()); }
  async node(id: string) { const node = (await this.bookmarks.get(id))[0]; if (!node) throw new Error('Элемент больше не существует.'); return node; }
  async folder(id: string) {
    const choices = await this.choices();
    if (!choices.some(choice => choice.id === id)) throw new Error('Папка закладок недоступна. Выберите другую папку в настройках.');
    return this.node(id);
  }
  async adoptRoot(id: string | null) {
    const previous = this.rootId;
    this.readGeneration++;
    this.rootId = id;
    this.activeId = null;
    const choices = await this.choices();
    const selected = choices.find(choice => choice.id === id);
    if (id && !selected) throw new Error('Папка закладок недоступна.');
    if (previous && selected && !choices.some(choice => choice.id === previous))
      this.sourceNotice = 'Выбранная папка недоступна. Используется папка «' + selected.path + '».';
  }
  async selectRoot(id: string) {
    await this.folder(id);
    if (await this.root.getValue() !== id) await this.root.setValue(id);
    this.readGeneration++;
    const changed = this.rootId !== id;
    this.rootId = id;
    this.sourceNotice = undefined;
    if (changed) this.activeId = null;
  }
  async initialize() {
    this.rootId = await this.root.getValue();
    this.activeId = null;
    return this.load();
  }
  async rootNode() { if (!this.rootId) throw new Error('Выберите папку закладок в настройках.'); return this.folder(this.rootId); }
  async parent(id = this.activeId ?? this.rootId) {
    const root = await this.rootNode();
    if (id === root.id) return root;
    if (!id) throw new Error('Категория не выбрана.');
    const node = await this.node(id);
    if (node.url || node.unmodifiable || node.folderType || node.parentId !== root.id) throw new Error('Категория была удалена или перемещена.');
    return node;
  }
  async bookmark(id: string) {
    const node = await this.node(id);
    if (!node.url || node.unmodifiable || !node.parentId) throw new Error('Закладка недоступна.');
    await this.parent(node.parentId);
    return node;
  }
  async search(query: string): Promise<Bookmark[]> {
    const text = query.trim().toLocaleLowerCase();
    const rootId = this.rootId;
    if (!text || !rootId) return [];
    const tree = await this.bookmarks.getSubTree(rootId);
    const root = tree[0];
    if (!root || root.unmodifiable) throw new Error('Папка закладок недоступна.');
    const children = root.children ?? [];
    const rows = children.flatMap(node => node.url ? [node] : (node.children ?? []).filter(child => child.url));
    return Promise.all(rows.filter(node => (node.title + '\n' + node.url).toLocaleLowerCase().includes(text)).map(async node => {
      const url = node.url!;
      const cache = await this.images.get(node.id, url);
      return { id:node.id, parentId:node.parentId!, url, title:node.title || url, index:node.index ?? 0,
        thumbnail:cache?.thumbnail ?? null, favicon:cache?.favicon ?? null, faviconColor:cache?.faviconColor ?? undefined,
        thumbnailUpdatedAt:cache?.thumbnailUpdatedAt, faviconUpdatedAt:cache?.faviconUpdatedAt };
    }));
  }
  async load(includeBackground = true): Promise<Snapshot> {
    const generation = ++this.readGeneration;
    const initialRoot = this.rootId;
    let rootId = initialRoot, activeId = this.activeId;
    const envelope = await this.settings.getValue();
    const background = includeBackground ? await this.db.assets.get('background') : undefined;
    let rootNotice = this.sourceNotice;
    const choices = await this.choices();
    if (!rootId || !choices.some(choice => choice.id === rootId)) {
      rootId = defaultFolderId(choices);
      activeId = null;
      if (rootId && generation === this.readGeneration && initialRoot === this.rootId) {
        await this.root.setValue(rootId);
        if (initialRoot) rootNotice = this.sourceNotice = 'Выбранная папка недоступна. Используется папка «Другие закладки».';
      }
    }
    let tabs: Bookmark[] = [], categories: Snapshot['categories'] = [];
    if (rootId) {
      const children = await this.bookmarks.getChildren(rootId);
      const folders = children.filter(node => !node.url);
      categories = folders.map(node => ({ id: node.id, title: node.title === 'Главная' ? 'Главная (папка)' : node.title, index: node.index ?? 0 }));
      if (folders.length && children.some(node => node.url)) categories.unshift({ id: rootId, title: 'Главная', index: -1, virtual: true });
      if (!activeId || (categories.length ? !categories.some(node => node.id === activeId) : activeId !== rootId)) activeId = categories[0]?.id ?? rootId;
      const nodes = activeId === rootId ? children : await this.bookmarks.getChildren(activeId);
      tabs = await Promise.all(nodes.filter(node => node.url).map(async node => {
        const url = node.url!;
        const cache = await this.images.get(node.id, url);
        return { id: node.id, parentId: node.parentId!, url, title: node.title || url, index: node.index ?? 0, thumbnail: cache?.thumbnail ?? null, favicon: cache?.favicon ?? null, faviconColor: cache?.faviconColor ?? undefined, thumbnailUpdatedAt: cache?.thumbnailUpdatedAt, faviconUpdatedAt: cache?.faviconUpdatedAt };
      }));
    }
    if (generation === this.readGeneration && initialRoot === this.rootId) { this.rootId = rootId; this.activeId = activeId; }
    return { tabs, categories, rootId, activeId, settings: envelope ? validateSettings(envelope.value) : { ...defaults }, background: background?.blob ?? null, rootNotice };
  }
  async saveSettings(settings: Settings, background?: Blob | null, rootId?: string) {
    const next = validateSettings(settings);
    if (rootId !== undefined) await this.folder(rootId);
    const previous = await this.settings.getValue();
    const previousSettings = validateSettings(previous?.value);
    const settingsChanged = (Object.keys(defaults) as Array<keyof Settings>).some(key => next[key] !== previousSettings[key]);
    const previousBackground = background !== undefined ? await this.db.assets.get('background') : undefined;
    let wroteSettings = false, wroteBackground = false;
    try {
      if (settingsChanged) { await this.settings.setValue({ value:next }); wroteSettings = true; }
      if (background !== undefined) {
        if (background) await this.db.assets.put({ key:'background', blob:background });
        else await this.db.assets.delete('background');
        wroteBackground = true;
      }
      // Commit the source last: failed writes cannot silently switch the root.
      if (rootId !== undefined) await this.selectRoot(rootId);
    } catch (error) {
      const rollback = await Promise.allSettled([
        wroteSettings ? this.settings.setValue(previous ?? {value:{...defaults}}) : Promise.resolve(),
        wroteBackground ? previousBackground ? this.db.assets.put(previousBackground) : this.db.assets.delete('background') : Promise.resolve(),
      ]);
      const detail = rollback.some(result => result.status === 'rejected') ? ' Часть настроек не удалось восстановить; проверьте значения.' : '';
      throw new Error((error instanceof Error ? error.message : String(error)) + detail);
    }
  }
  async saveSearchProvider(searchProvider: SearchProviderId) {
    await this.patchSettings({ searchProvider });
  }
  async patchSettings(patch: Partial<Settings>): Promise<Settings> {
    if (Object.keys(patch).some(key => !Object.hasOwn(defaults,key))) throw new Error('Неизвестный параметр настроек.');
    const current = validateSettings((await this.settings.getValue())?.value);
    const next = validateSettings({ ...current, ...patch });
    await this.saveSettings(next);
    return next;
  }
  async reset() { await this.saveSettings({ ...defaults }, null); await this.images.clear(); }
  async saveBackground(background: Blob | null) {
    if (background) await this.db.assets.put({ key:'background', blob:background });
    else await this.db.assets.delete('background');
  }
  async add(input: { url: string; title: string }) {
    const parent = await this.parent(); const url = normalizeUrl(input.url);
    return (await this.bookmarks.create({ parentId: parent.id, url, title: input.title || new URL(url).hostname })).id;
  }
  async edit(id: string, url: string, title: string, parentId?: string) {
    await this.bookmark(id);
    if (parentId) await this.parent(parentId);
    await this.bookmarks.update(id, { url: normalizeUrl(url), title });
    if (parentId) { await this.bookmark(id); await this.parent(parentId); await this.bookmarks.move(id, { parentId }); }
  }
  async cache(id: string, url: string, resource: 'thumbnail' | 'favicon', blob: Blob) {
    const node = await this.node(id);
    if (node.url !== url) throw new Error('Закладка изменена; изображение не сохранено.');
    await this.images.put(id, url, resource, blob);
  }
  async remove(id: string) { await this.bookmark(id); await this.bookmarks.remove(id); await this.images.remove(id); }
  async reorder(ids: string[]) {
    const parent = await this.parent();
    const children = await this.bookmarks.getChildren(parent.id);
    const nodes = children.filter(node => node.url);
    if (new Set(ids).size !== ids.length || ids.length !== nodes.length || nodes.some(node => !ids.includes(node.id))) throw new Error('Список изменился; повторите перетаскивание.');
    const slots = nodes.map(node => node.index ?? children.indexOf(node));
    for (let i = 0; i < ids.length; i++) { await this.bookmark(ids[i]!); await this.parent(parent.id); await this.bookmarks.move(ids[i]!, { parentId: parent.id, index: slots[i]! }); }
  }
  async createCategory(title: string) { const root = await this.rootNode(); if (!title.trim()) throw new Error('Введите название.'); await this.bookmarks.create({ parentId: root.id, title: title.trim() }); }
  async category(id: string): Promise<BookmarkNode> { const node = await this.parent(id); if (id === this.rootId) throw new Error('Основная папка защищена.'); return node; }
  async renameCategory(id: string, title: string) { await this.category(id); if (!title.trim()) throw new Error('Введите название.'); await this.bookmarks.update(id, { title: title.trim() }); }
  async removeCategory(id: string) { await this.category(id); await this.bookmarks.removeTree(id); }
  async moveCategory(id: string, beforeId: string) { await this.category(id); const target = await this.category(beforeId); await this.bookmarks.move(id, { parentId: this.rootId!, index: target.index ?? 0 }); }
  async exportData(): Promise<ImportData> {
    const root = await this.rootNode(); const children = await this.bookmarks.getChildren(root.id);
    const row = (node: BookmarkNode) => ({ title: node.title, url: node.url! });
    const entries = await Promise.all(children.map(async node => node.url ? row(node) : { title: node.title, children: (await this.bookmarks.getChildren(node.id)).filter(child => child.url).map(row) }));
    const snapshot = await this.load(); return { entries, settings: snapshot.settings, background: snapshot.background };
  }
  async importData(data: ImportData) {
    const root = await this.rootNode(); let bookmarks = 0, folders = 0;
    try {
      for (const entry of data.entries) {
        await this.rootNode();
        if ('url' in entry) { await this.bookmarks.create({ parentId: root.id, ...entry }); bookmarks++; }
        else { const folder = await this.bookmarks.create({ parentId: root.id, title: entry.title }); folders++;
          for (const child of entry.children) { await this.category(folder.id); await this.bookmarks.create({ parentId: folder.id, ...child }); bookmarks++; }
        }
      }
      await this.saveSettings(data.settings, data.background);
    } catch (error) { throw new Error(`Импорт прерван: добавлено закладок ${bookmarks}, папок ${folders}. ${error instanceof Error ? error.message : error}`); }
  }
}
