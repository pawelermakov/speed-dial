import { BookmarkAssetStore } from './bookmarkAssets';
import type { DialDatabase } from './database';
import type { SettingsPort } from './settings';
import { allBackupSections, type BackupSelection, defaults, type Bookmark, type Settings, type Snapshot, type ImportData, type BackupBookmark, type ImportReport, type SearchProviderId } from '../types/models';
import { normalizeUrl, validateSettings } from './validation';
import { isBookmark, isFolder, folderChoices, defaultFolderId, type BookmarksPort, type RootPort, type BookmarkNode } from './bookmarks';
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
  selectFolder(id:string) { this.readGeneration++;this.activeId=id; }
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
    if (!id) throw new Error('Папка не выбрана.');
    const node = await this.node(id);
    if (!isFolder(node) || node.unmodifiable || node.folderType || node.parentId !== root.id) throw new Error('Папка была удалена или перемещена.');
    return node;
  }
  async bookmark(id: string) {
    const node = await this.node(id);
    if (!isBookmark(node) || node.unmodifiable || !node.parentId) throw new Error('Закладка недоступна.');
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
    const rows = children.flatMap(node => isBookmark(node) ? [node] : (node.children ?? []).filter(isBookmark));
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
    let tabs: Bookmark[] = [], folders: Snapshot['folders'] = [];
    if (rootId) {
      const children = await this.bookmarks.getChildren(rootId);
      const childFolders = children.filter(node => isFolder(node) && !node.unmodifiable);
      const rootTitle = choices.find(choice => choice.id === rootId)!.title;
      folders = [{ id: rootId, title: rootTitle, index: -1, virtual: true }, ...childFolders.map(node => ({ id: node.id, title: node.title === rootTitle ? rootTitle + ' (папка)' : node.title, index: node.index ?? 0 }))];
      if (!activeId || (folders.length ? !folders.some(node => node.id === activeId) : activeId !== rootId)) activeId = folders[0]?.id ?? rootId;
      const nodes = activeId === rootId ? children : await this.bookmarks.getChildren(activeId);
      tabs = await Promise.all(nodes.filter(isBookmark).map(async node => {
        const url = node.url!;
        const cache = await this.images.get(node.id, url);
        return { id: node.id, parentId: node.parentId!, url, title: node.title || url, index: node.index ?? 0, thumbnail: cache?.thumbnail ?? null, favicon: cache?.favicon ?? null, faviconColor: cache?.faviconColor ?? undefined, thumbnailUpdatedAt: cache?.thumbnailUpdatedAt, faviconUpdatedAt: cache?.faviconUpdatedAt };
      }));
    }
    if (generation === this.readGeneration && initialRoot === this.rootId) { this.rootId = rootId; this.activeId = activeId; }
    return { tabs, folders, rootId, activeId, settings: envelope ? validateSettings(envelope.value) : { ...defaults }, background: background?.blob ?? null, rootNotice };
  }
  async saveSettings(settings: Settings, background?: Blob | null, rootId?: string, replace=false) {
    const next = validateSettings(settings);
    if (rootId !== undefined) await this.folder(rootId);
    const previous = await this.settings.getValue();
    let previousSettings:Settings;
    try{previousSettings=validateSettings(previous?.value);}catch{previousSettings={...defaults};}
    const settingsChanged = (Object.keys(defaults) as Array<keyof Settings>).some(key => next[key] !== previousSettings[key]);
    const previousBackground = background !== undefined ? await this.db.assets.get('background') : undefined;
    let wroteSettings = false, wroteBackground = false;
    try {
      if (settingsChanged||replace) { await this.settings.setValue({ value:next },replace); wroteSettings = true; }
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
  async reset() { await this.saveSettings({ ...defaults }, null,undefined,true); await this.images.clear(); await this.db.autoNames.clear(); }
  async saveBackground(background: Blob | null) {
    if (background) await this.db.assets.put({ key:'background', blob:background });
    else await this.db.assets.delete('background');
  }
  async add(input: { url: string; title: string; parentId?: string }) {
    const parent = await this.parent(input.parentId); const url = normalizeUrl(input.url);
    const title = input.title.trim() ? input.title : '';
    const id = (await this.bookmarks.create({ parentId: parent.id, url, title: title || new URL(url).hostname })).id;
    if (!title) await this.markAutoName(id, url);
    return id;
  }
  private async markAutoName(bookmarkId: string, url: string, pendingEdit?: { url: boolean; title: boolean }) {
    // Optional provenance: failure must never turn a saved bookmark into a failed submit.
    await this.db.autoNames.put({ bookmarkId, url, token: crypto.randomUUID(), pendingEdit }).catch(() => {});
  }
  async edit(id: string, url: string, title: string, parentId?: string, titleEdited = true, expected?: { url: string; title: string; parentId: string }) {
    const before = await this.bookmark(id);
    if (expected && (before.url !== expected.url || before.title !== expected.title || before.parentId !== expected.parentId))
      throw new Error('Закладка изменена в другом окне. Откройте её заново.');
    url = normalizeUrl(url);
    if (!title.trim()) title = '';
    if (parentId) await this.parent(parentId);
    const marker = await this.db.autoNames.get(id).catch(() => undefined);
    const automatic = !title || (!titleEdited && marker?.url === before.url && before.title === new URL(before.url!).hostname);
    const nextTitle = automatic ? new URL(url).hostname : title;
    const changed = before.url !== url || before.title !== nextTitle;
    if (!automatic || changed || titleEdited || !marker) {
      await this.db.autoNames.delete(id).catch(() => {});
      if (automatic) await this.markAutoName(id, url, { url: before.url !== url, title: before.title !== nextTitle });
    }
    try { if (changed) await this.bookmarks.update(id, { url, title: nextTitle }); }
    catch (error) { await this.db.autoNames.delete(id).catch(() => {}); throw error; }
    if (parentId && parentId !== before.parentId) { await this.bookmark(id); await this.parent(parentId); await this.bookmarks.move(id, { parentId }); }
    return before.url !== url;
  }
  async autoNameTicket(id: string) { return this.db.autoNames.get(id).catch(() => undefined); }
  async applyCapturedTitle(id: string, url: string, title: string, ticket: Awaited<ReturnType<Repository['autoNameTicket']>>) {
    title = title.replace(/\s+/g, ' ').trim();
    if (!ticket || !title || title.length > 4096 || /[\u0000-\u001f\u007f]/.test(title) ||
      /^(about:|chrome:|edge:|moz-extension:|https?:\/\/|error\b|ошибка\b|access denied|just a moment|attention required)/i.test(title) ||
      title.toLowerCase().replace(/^www\./, '') === new URL(url).hostname.toLowerCase().replace(/^www\./, '')) return;
    await withDataLock(async () => {
      const marker = await this.autoNameTicket(id);
      if (marker?.token !== ticket.token || marker.url !== url) return;
      let node: BookmarkNode;
      try { node = await this.bookmark(id); } catch { return; }
      if (node.url !== url || node.title !== new URL(url).hostname) return;
      await this.db.autoNames.delete(id);
      await this.bookmarks.update(id, { title });
    });
  }
  async cache(id: string, url: string, resource: 'thumbnail' | 'favicon', blob: Blob, expected?: { title: string; parentId?: string }) {
    const node = await this.node(id);
    if (node.url !== url || (expected && (node.title !== expected.title || node.parentId !== expected.parentId))) throw new Error('Закладка изменена; изображение не сохранено.');
    await this.images.put(id, url, resource, blob);
  }
  async remove(id: string) { await this.bookmark(id); await this.bookmarks.remove(id); await this.images.remove(id); await this.db.autoNames.delete(id); }
  private async sortChildren(parentId: string, ids: string[], folders: boolean, expected?: string[]) {
    const sourceRoot = this.rootId;
    const original = await this.bookmarks.getChildren(parentId);
    const nodes = original.filter(node => folders ? isFolder(node) && !node.unmodifiable : isBookmark(node));
    const order = nodes.map(node => node.id);
    if (new Set(ids).size !== ids.length || ids.length !== order.length || order.some(id => !ids.includes(id)) ||
      (expected && expected.join() !== order.join())) throw new Error('Список изменился; повторите перетаскивание.');
    let cursor = 0;
    const desired = original.map(node => order.includes(node.id) ? ids[cursor++]! : node.id);
    let current = original.map(node => node.id);
    for (let i = 0; i < desired.length; i++) {
      while (current[i] !== desired[i]) {
        const actual = await this.bookmarks.getChildren(parentId);
        if (this.rootId !== sourceRoot || actual.map(node => node.id).join() !== current.join() || actual.some(node => node.url !== original.find(row => row.id === node.id)?.url || node.title !== original.find(row => row.id === node.id)?.title))
          throw new Error('Список изменился; повторите перетаскивание.');
        await this.parent(parentId);
        const id = order.includes(desired[i]!) ? desired[i]! : current[i]!;
        const target = desired[i] === id ? i : desired.indexOf(id);
        // Chromium counts the destination before removing the source; Firefox
        // and the test port count its final position in the resulting children.
        const index = target + Number(import.meta.env.BROWSER === 'chrome' && current.indexOf(id) < target);
        await this.bookmarks.move(id, { parentId, index });
        current.splice(current.indexOf(id), 1); current.splice(target, 0, id);
      }
    }
    if ((await this.bookmarks.getChildren(parentId)).map(node => node.id).join() !== desired.join())
      throw new Error('Порядок изменился; показаны актуальные закладки.');
  }
  async reorder(ids: string[], expected?: string[], parentId = this.activeId) {
    if (parentId !== this.activeId) throw new Error('Папка изменилась; повторите перетаскивание.');
    const parent = await this.parent(parentId ?? undefined);
    await this.sortChildren(parent.id, ids, false, expected);
  }
  async reorderFolders(ids: string[], expected?: string[]) {
    const root = await this.rootNode();
    await this.sortChildren(root.id, ids, true, expected);
  }
  async createFolder(title: string) {
    const root = await this.rootNode(); if (!title.trim()) throw new Error('Введите название.');
    const node = await this.bookmarks.create({ parentId: root.id, title: title.trim() });
    this.activeId = node.id;
  }
  async childFolder(id: string): Promise<BookmarkNode> { const node = await this.parent(id); if (id === this.rootId) throw new Error('Основная папка защищена.'); return node; }
  async renameFolder(id: string, title: string) { await this.childFolder(id); if (!title.trim()) throw new Error('Введите название.'); if ((await this.childFolder(id)).title !== title.trim()) await this.bookmarks.update(id, { title: title.trim() }); }
  async removeFolder(id: string) { await this.childFolder(id); await this.bookmarks.removeTree(id); }
  async moveFolder(id: string, beforeId: string) { await this.childFolder(id); const target = await this.childFolder(beforeId); await this.bookmarks.move(id, { parentId: this.rootId!, index: target.index ?? 0 }); }
  async exportData(warning:(message:string)=>void=()=>{},selection:BackupSelection=allBackupSections): Promise<ImportData> {
    const children=(selection.bookmarks||selection.images)&&this.rootId?(await this.bookmarks.getChildren((await this.rootNode()).id)):[];
    const row=async(node:BookmarkNode):Promise<BackupBookmark>=>{
      const result:BackupBookmark={title:node.title,url:node.url!};
      try{
        const cache=selection.images?await this.db.tileAssets.get([node.id,node.url!]):undefined;
        for(const key of ['thumbnail','favicon'] as const)if(cache?.[key]){result[key]=cache[key];}
        const marker=await this.db.autoNames.get(node.id);
        if(selection.bookmarks&&marker?.url===node.url && node.title===new URL(node.url!).hostname)result.autoName=true;
      }catch{warning('Не удалось прочитать изображения или автоматическое название: '+node.title);}
      return result;
    };
    const entries:ImportData['entries']=[];
    for(const node of children){
      if(isBookmark(node))entries.push(await row(node));
      else if(isFolder(node)&&!node.unmodifiable){
        const nested=await this.bookmarks.getChildren(node.id),rows=[];
        if(nested.some(isFolder))warning('Вложенные папки не включены: '+node.title);
        for(const child of nested.filter(isBookmark))rows.push(await row(child));
        entries.push({title:node.title,children:rows});
      }
    }
    return {entries,...(!selection.bookmarks?{bookmarks:false as const}:{}),...(selection.settings?{settings:validateSettings((await this.settings.getValue())?.value)}:{}),...(selection.background?{background:(await this.db.assets.get('background'))?.blob??null}:{})};
  }
  async importData(data:ImportData,destination:string,expectedSettings?:Settings,selection:BackupSelection=allBackupSections):Promise<ImportReport> {
    const includeBookmarks=selection.bookmarks&&data.bookmarks!==false;
    const includeImages=selection.images;
    const target=(includeBookmarks||includeImages)?await this.folder(destination):undefined;
    const checkDestination=async()=>{const node=await this.node(destination);if(!isFolder(node)||node.unmodifiable||node.parentId!==target?.parentId)throw new Error('Папка назначения удалена, перемещена или недоступна.');};
    if(selection.settings&&data.settings&&expectedSettings){
      const currentSettings=validateSettings((await this.settings.getValue())?.value);
      if((Object.keys(defaults) as Array<keyof Settings>).some(key=>currentSettings[key]!==expectedSettings[key]))throw new Error('Настройки изменились в другой вкладке. Выберите файл повторно, чтобы подтвердить актуальные данные.');
    }
    const report:ImportReport={bookmarks:0,folders:0,images:0,warnings:[]};
    // Consume existing siblings once, preserving intentional repeated entries in the backup.
    const siblings=new Map<string,BookmarkNode[]>();
    const take=async(parentId:string,title:string,url?:string)=>{
      if(!siblings.has(parentId))siblings.set(parentId,await this.bookmarks.getChildren(parentId));
      const nodes=siblings.get(parentId)!;
      const index=nodes.findIndex(node=>!node.unmodifiable&&node.title===title&&(url===undefined?isFolder(node):isBookmark(node)&&node.url===url));
      return index<0?undefined:nodes.splice(index,1)[0];
    };
    const add=async(row:BackupBookmark,parentId:string)=>{
      await checkDestination();
      if(parentId!==destination){const folder=await this.node(parentId);if(!isFolder(folder)||folder.unmodifiable||folder.parentId!==destination)throw new Error('Папка удалена или перемещена.');}
      const existing=await take(parentId,row.title,row.url);
      if(!existing&&!includeBookmarks){if(row.thumbnail||row.favicon)report.skipped=(report.skipped??0)+1;return;}
      const node=existing?await this.node(existing.id):await this.bookmarks.create({parentId,title:row.title,url:row.url});
      if(!existing)report.bookmarks++;
      if(!isBookmark(node)||node.unmodifiable||node.parentId!==parentId||node.title!==row.title||node.url!==row.url)throw new Error('Закладка изменена или перемещена во время импорта.');
      for(const key of ['thumbnail','favicon'] as const)if(includeImages&&row[key]){
        try{await this.cache(node.id,row.url,key,row[key],{title:row.title,parentId});report.images++;}
        catch{report.warnings.push('Не удалось сохранить изображение: '+row.title+' / '+key);}
      }
      if(row.autoName&&!existing)try{await this.db.autoNames.put({bookmarkId:node.id,url:row.url,token:crypto.randomUUID()});}catch{report.warnings.push('Не удалось сохранить автоматическое название: '+row.title);}
    };
    try {
      for(const entry of (includeBookmarks||includeImages)?data.entries:[]){
        await checkDestination();
        if('url' in entry)await add(entry,destination);
        else{
          const existing=await take(destination,entry.title);
          if(!existing&&!includeBookmarks){const missing=entry.children.filter(row=>row.thumbnail||row.favicon).length;if(missing)report.skipped=(report.skipped??0)+missing;continue;}
          const folder=existing?await this.node(existing.id):await this.bookmarks.create({parentId:destination,title:entry.title});
          if(!existing)report.folders++;
          if(!isFolder(folder)||folder.unmodifiable||folder.parentId!==destination||folder.title!==entry.title)throw new Error('Папка изменена или перемещена во время импорта.');
          for(const child of entry.children)await add(child,folder.id);
        }
      }
      const settings=selection.settings?data.settings:undefined,background=selection.background?data.background:undefined;
      if(settings)await this.saveSettings(settings,background,undefined,true);
      else if(background!==undefined){if(background)await this.db.assets.put({key:'background',blob:background});else await this.db.assets.delete('background');}
      if(settings)report.settings=true;
      if(background!==undefined)report.background=true;
    }catch(error){report.error='Импорт прерван: '+(error instanceof Error?error.message:String(error));}
    return report;
  }
}
