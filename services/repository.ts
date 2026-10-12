import { BookmarkAssetStore } from './bookmarkAssets';
import type { DialDatabase } from './database';
import type { SettingsPort } from './settings';
import { defaults, type Bookmark, type Settings, type Snapshot, type ImportData } from '../types/models';
import { normalizeUrl, validateSettings } from './validation';
import { folderChoices, selectable, type BookmarksPort, type RootPort, type BookmarkNode } from './bookmarks';
export async function withDataLock<T>(operation: () => Promise<T>): Promise<T> { return navigator.locks ? navigator.locks.request('speed-dial-data', operation) : operation(); }
export class Repository {
  rootId: string | null = null;
  activeId: string | null = null;
  private readGeneration = 0;
  private images: BookmarkAssetStore;
  constructor(private db: DialDatabase, private settings: SettingsPort, readonly bookmarks: BookmarksPort, private root: RootPort) { this.images = new BookmarkAssetStore(db); }
  async choices() { return folderChoices(await this.bookmarks.getTree()); }
  async node(id: string) { const node = (await this.bookmarks.get(id))[0]; if (!node) throw new Error('Элемент больше не существует.'); return node; }
  async folder(id: string, allowStandard = false) {
    const node = await this.node(id);
    const choices = await this.choices();
    if (!choices.some(choice => choice.id === id && (allowStandard || !choice.standard)) || (!allowStandard && !selectable(node))) throw new Error('Выберите изменяемую пользовательскую папку.');
    return node;
  }
  async adoptRoot(id: string) { await this.folder(id); this.rootId = id; this.activeId = null; }
  async selectRoot(id: string) { await this.folder(id); await this.root.setValue(id); this.rootId = id; this.activeId = null; }
  async initialize() {
    const saved = await this.root.getValue();
    if (saved) { try { await this.selectRoot(saved); return await this.load(); } catch { /* Search an unambiguous replacement. */ } }
    const candidates = (await this.choices()).filter(node => node.title === 'Speed Dial' && !node.standard);
    if (candidates.length === 1) await this.selectRoot(candidates[0]!.id);
    return this.load();
  }
  async createRoot(parentId: string) {
    const candidates = (await this.choices()).filter(node => node.title === 'Speed Dial' && !node.standard);
    if (candidates.length) throw new Error('Папка Speed Dial уже существует. Выберите её в списке.');
    await this.folder(parentId, true);
    const node = await this.bookmarks.create({ parentId, title: 'Speed Dial' });
    await this.selectRoot(node.id);
  }
  async rootNode() { if (!this.rootId) throw new Error('Сначала выберите основную папку.'); return this.folder(this.rootId); }
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
  async load(): Promise<Snapshot> {
    const generation = ++this.readGeneration;
    const initialRoot = this.rootId;
    let rootId = initialRoot, activeId = this.activeId;
    const envelope = await this.settings.getValue();
    const background = await this.db.assets.get('background').catch(() => undefined);
    let tabs: Bookmark[] = [], categories: Snapshot['categories'] = [];
    if (rootId) {
      const choices = await this.choices();
      if (!choices.some(node => node.id === rootId && !node.standard)) { rootId = null; activeId = null; }
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
          return { id: node.id, parentId: node.parentId!, url, title: node.title || url, index: node.index ?? 0, thumbnail: cache?.thumbnail ?? null, favicon: cache?.favicon ?? null };
        }));
      }
    }
    if (generation === this.readGeneration && initialRoot === this.rootId) { this.rootId = rootId; this.activeId = activeId; }
    return { tabs, categories, rootId, activeId, settings: envelope ? validateSettings(envelope.value) : { ...defaults }, background: background?.blob ?? null };
  }
  async saveSettings(settings: Settings, background?: Blob | null) {
    await this.settings.setValue({ value: validateSettings(settings) });
    if (background !== undefined) { if (background) await this.db.assets.put({ key: 'background', blob: background }); else await this.db.assets.delete('background'); }
  }
  async reset() { await this.saveSettings({ ...defaults }, null); await this.images.clear(); }
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
  async clear() {
    const root = await this.rootNode(); const children = await this.bookmarks.getChildren(root.id);
    for (const child of children.filter(node => !node.url)) if ((await this.bookmarks.getChildren(child.id)).some(node => !node.url)) throw new Error('Есть вложенные папки. Очистите их в менеджере закладок браузера.');
    for (const child of children) {
      if (child.url) await this.remove(child.id);
      else {
        await this.category(child.id);
        for (const bookmark of await this.bookmarks.getChildren(child.id)) {
          if (!bookmark.url) throw new Error('Появилась вложенная папка. Очистка прервана; используйте менеджер закладок.');
          await this.remove(bookmark.id);
        }
        await this.category(child.id);
        // remove fails if an external edit added any unseen descendant.
        await this.bookmarks.remove(child.id);
      }
    }
  }
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
