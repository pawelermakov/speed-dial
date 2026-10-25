import { defaults, type Settings } from '../types/models';
import { folderKey, settingKeys, syncPatch, syncPrefix, validSetting, storedSettings } from './settingsSchema';
import { locateFolder, resolveFolder, validLocator, portableFolder } from './folderLocator';
import type { BookmarkNode } from './bookmarks';
import { folderChoices } from './bookmarks';

export interface StorageArea {
  get(keys?: string[] | null): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove?(keys:string|string[]):Promise<void>;
}
export interface SyncState { error: string; folder: string; confirm: boolean }
export const syncStateKey = 'settingsSyncState';
const lastWriteKey = 'settingsSyncLastWrite';
const selectedSourceKey='settingsSyncSelectedSource.v1';
function equal(a:unknown,b:unknown):boolean {
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
  const keys=Object.keys(left);
  return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&equal(left[key],right[key]));
}
export interface SyncPorts {
  local: StorageArea;
  sync: StorageArea;
  tree(): Promise<BookmarkNode[]>;
  lock<T>(job: () => Promise<T>): Promise<T>;
  account(): Promise<string | null>;
  now?: () => number;
}

/** One coordinator in the background, shared by all new-tab pages. Only
 * explicit local edits enter the outbox; applying remote data never echoes it. */
export class SettingsSync {
  private pending: Record<string, unknown> = {};
  private cloud: Record<string, unknown> = {};
  private timer?: ReturnType<typeof setTimeout>;
  private tail: Promise<unknown> = Promise.resolve();
  private epoch = 0;
  private accountId: string | null = null; // Memory only, never passed to storage.
  private selectedId: string | null = null;
  private manualFolder = false;
  private folderEpoch = 0;
  private lastWrite = 0;
  private flushing?:Promise<void>;
  private state: SyncState = { error: '', folder: '', confirm: false };
  private now: () => number;
  constructor(private ports: SyncPorts) { this.now = ports.now ?? Date.now; }
  private serial<T>(job: () => Promise<T>): Promise<T> {
    const result = this.tail.then(job);
    this.tail = result.catch(() => {});
    return result;
  }
  private async publish(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    await this.ports.local.set({ [syncStateKey]: this.state });
  }
  private async snapshot(): Promise<Settings> {
    const local = await this.ports.local.get(['settings']);
    try { return storedSettings((local.settings as { value?: unknown } | undefined)?.value); }
    catch { return { ...defaults }; }
  }
  private async apply(patch: Partial<Settings>) {
    if (!Object.keys(patch).length) return;
    const epoch=this.epoch;
    await this.ports.lock(async () => {
      if(epoch!==this.epoch)return;
      const current = await this.snapshot(), next = { ...current, ...patch };
      if(epoch!==this.epoch)return;
      if (!equal(current, next)) await this.ports.local.set({ settings: { value: next } });
    });
  }
  private enqueue(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) {
      if (equal(this.cloud[key], value)) delete this.pending[key];
      else this.pending[key] = value;
    }
    this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!Object.keys(this.pending).length) return;
    this.timer = setTimeout(() => { void this.flush(); }, Math.max(500, this.lastWrite + 2200 - this.now()));
  }
  private async failure(error?:unknown) {
    // Browser error strings may contain submitted data. Keep the public reason
    // bounded and free of account identifiers or user content.
    const quota=error instanceof Error&&/quota|max_write|max_items/i.test(error.message);
    await this.publish({ error: (quota?'Превышен лимит хранилища синхронизации.':'Хранилище синхронизации недоступно.')+' Настройки сохранены локально. Повторите проверку.' });
  }
  initialize() { const epoch=this.epoch;return this.serial(async () => {
    if(epoch!==this.epoch)return;
    const local = await this.ports.local.get(['settings', lastWriteKey]);
    this.lastWrite = typeof local[lastWriteKey] === 'number' ? local[lastWriteKey] as number : 0;
    this.accountId = await this.ports.account();
    if(epoch!==this.epoch)return;
    try {
      await this.ports.lock(async()=>{if(epoch!==this.epoch)return;const saved=await this.ports.local.get(['settings']);if(epoch!==this.epoch)return;if(saved.settings){const raw=(saved.settings as {value?:unknown}).value,next=storedSettings(raw);if(!equal(raw,next))await this.ports.local.set({settings:{value:next}});}});
      if(epoch!==this.epoch)return;
      // Retire the manually entered Mail.ru address from browser Sync as well.
      await this.ports.sync.remove?.(syncPrefix+'email');
      if(epoch!==this.epoch)return;
      this.cloud = await this.ports.sync.get(null);
      if(epoch!==this.epoch)return;
      const remote = syncPatch(this.cloud);
      await this.apply(remote);
      if(epoch!==this.epoch)return;
      const missing = settingKeys.filter(key => !(key in remote));
      await this.publish({ error: '', confirm: !!local.settings && missing.length > 0 });
      if(epoch!==this.epoch)return;
      if (this.cloud[folderKey] !== undefined) await this.restoreFolder();
    } catch(error) { await this.failure(error); }
  }); }
  changed(patch: Partial<Settings>) { const epoch=this.epoch; return this.serial(async () => {
    if(epoch!==this.epoch)return;
    const values: Record<string, unknown> = {};
    for (const key of settingKeys) if (Object.hasOwn(patch, key) && validSetting(key, patch[key])) { values[syncPrefix + key] = patch[key]; }
    this.enqueue(values);
  }); }
  /** Immediate flush still obeys the sustained write limit. It returns after the
   * write, so closing a panel cannot strand its last change in a page timer. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if(this.flushing)return this.flushing;
    const epoch = this.epoch;
    let failed=false;
    const task=(async()=>{
      const wait = this.lastWrite + 2200 - this.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, Math.min(wait, 2200)));
      await this.serial(async () => {
        if (epoch !== this.epoch || !Object.keys(this.pending).length) return;
        const batch = this.pending; this.pending = {};
        try {
          if(!Object.keys(batch).length)return;
          this.lastWrite = this.now();
          await this.ports.local.set({ [lastWriteKey]: this.lastWrite });
          if (epoch !== this.epoch) return;
          await this.ports.sync.set(batch);
          if (epoch !== this.epoch) return;
          Object.assign(this.cloud, batch);
          await this.publish({ error: '',...(settingKeys.every(key=>validSetting(key,this.cloud[syncPrefix+key]))?{confirm:false}:{}) });
        } catch(error) {
          failed=true;
          if (epoch !== this.epoch) return;
          this.pending = { ...batch, ...this.pending };
          await this.failure(error);
          // No error retry loop. Next explicit edit/check retries the outbox.
        }
      });
    })();
    this.flushing=task.finally(()=>{
      this.flushing=undefined;
      if(!failed&&Object.keys(this.pending).length)this.schedule();
    });
    return this.flushing;
  }
  remote(changes: Record<string, { newValue?: unknown }>) { const epoch=this.epoch;return this.serial(async () => {
    if(epoch!==this.epoch)return;
    const apply: Record<string, unknown> = {};
    for (const [key, change] of Object.entries(changes)) {
      if(key!==folderKey&&!settingKeys.some(field=>syncPrefix+field===key))continue;
      if (equal(this.cloud[key], change.newValue)) continue;
      this.cloud[key] = change.newValue;
      if(change.newValue!==undefined){
        if(key===folderKey&&!validLocator(change.newValue)){
          await this.publish({folder:'Выберите папку вручную: сохранённый путь повреждён.'});continue;
        }
        if(key!==folderKey&&!validSetting(key.slice(syncPrefix.length) as keyof Settings,change.newValue))continue;
      }
      // An arriving remote update supersedes an older queued value of this field.
      delete this.pending[key];
      apply[key] = change.newValue;
    }
    await this.apply(syncPatch(apply));
    if(epoch!==this.epoch)return;
    if(settingKeys.every(key=>validSetting(key,this.cloud[syncPrefix+key])))await this.publish({confirm:false});
    if (Object.hasOwn(apply, folderKey)) { this.folderEpoch++; this.selectedId = null; this.manualFolder=false; await this.restoreFolder(); }
  }); }
  private async restoreFolder() {
    const value = this.cloud[folderKey];
    if (value === undefined) return;
    if (!validLocator(value)) { await this.publish({ folder: 'Выберите папку вручную: сохранённый путь повреждён.' }); return; }
    const generation = this.folderEpoch, epoch = this.epoch;
    let tree:BookmarkNode[];
    try{tree=await this.ports.tree();}
    catch{if(generation===this.folderEpoch&&epoch===this.epoch)await this.publish({folder:'Не удалось проверить папку. Выберите её вручную или повторите проверку.'});return;}
    const id = resolveFolder(tree, value);
    if (generation !== this.folderEpoch || epoch !== this.epoch) return;
    if (!id) {
      this.selectedId = null;
      // Keep tracking a previously selected local ID on this device, without
      // ever choosing a same-named local folder on another device.
      if(value.anchor.syncing===false){
        const local=await this.ports.local.get(['rootFolderId']);
        if(generation!==this.folderEpoch||epoch!==this.epoch)return;
        if(typeof local.rootFolderId==='string'&&equal(locateFolder(tree,local.rootFolderId),value))this.selectedId=local.rootFolderId;
      }
      await this.publish({ folder: portableFolder(value) ? `Ожидаем папку из ${value.anchor.browser === 'firefox' ? 'Firefox' : 'Chrome'}. Если она недоступна, выберите папку вручную.` : 'Выберите папку вручную: локальная папка не переносится между устройствами.' });
      return;
    }
    await this.ports.lock(async () => {
      if (generation !== this.folderEpoch || epoch !== this.epoch) return;
      const local = await this.ports.local.get(['rootFolderId']);
      await this.ports.local.set({...(local.rootFolderId!==id?{rootFolderId:id}:{}),[selectedSourceKey]:{id,locator:value}});
      this.selectedId = id;
    });
    await this.publish({ folder: 'Папка восстановлена' });
  }
  selectFolder(id: string) {
    const generation=++this.folderEpoch,epoch=this.epoch;
    this.manualFolder=true;
    delete this.pending[folderKey];
    return this.serial(async () => {if(generation===this.folderEpoch&&epoch===this.epoch)await this.selectFolderInternal(id);});
  }
  private async selectFolderInternal(id: string) {
    const generation = this.folderEpoch, epoch = this.epoch;
    this.selectedId=id;
    let tree:BookmarkNode[];
    try{tree=await this.ports.tree();}
    catch{if(generation===this.folderEpoch&&epoch===this.epoch)await this.publish({folder:'Папка выбрана локально. Не удалось получить её путь — повторите проверку.'});return;}
    const locator = locateFolder(tree, id);
    if (generation !== this.folderEpoch || epoch !== this.epoch) return;
    this.selectedId = id;
    if (!locator) {
      if(!folderChoices(tree).some(choice=>choice.id===id)){this.selectedId=null;this.manualFolder=false;}
      await this.publish({ folder: 'Выберите папку вручную: путь к выбранной папке недоступен.' }); return;
    }
    // Local evidence of an explicit/resolved source lets a cold MV3 worker
    // recognize a subsequent native rename/move event. It never goes to sync.
    await this.ports.local.set({[selectedSourceKey]:{id,locator}});
    if(generation!==this.folderEpoch||epoch!==this.epoch)return;
    this.enqueue({ [folderKey]: locator });
    await this.publish({ folder: portableFolder(locator) ? '' : 'Локальная папка: на другом устройстве потребуется ручной выбор.' });
  }
  bookmarksChanged(changedId?:string) { const receivedEpoch=this.epoch;return this.serial(async () => {
    if(receivedEpoch!==this.epoch)return;
    if(!this.selectedId&&changedId){
      const epoch=this.epoch,generation=this.folderEpoch;
      const local=await this.ports.local.get([selectedSourceKey,'rootFolderId']);
      const memo=local[selectedSourceKey] as {id?:unknown;locator?:unknown}|undefined;
      if(memo&&typeof memo.id==='string'&&memo.id===local.rootFolderId&&validLocator(memo.locator)&&equal(memo.locator,this.cloud[folderKey])){
        const tree=await this.ports.tree();
        const relevant=(nodes:BookmarkNode[],ancestor=false):boolean=>nodes.some(node=>!node.url&&!node.unmodifiable&&(node.id===memo.id?ancestor||node.id===changedId:relevant(node.children??[],ancestor||node.id===changedId)));
        if(epoch!==this.epoch||generation!==this.folderEpoch)return;
        if(relevant(tree))this.selectedId=memo.id;
      }
    }
    if(receivedEpoch!==this.epoch)return;
    if (this.selectedId) await this.selectFolderInternal(this.selectedId);
    else if(!this.manualFolder)await this.restoreFolder();
  }); }
  /** Invalidate immediately, before queued getTree/storage promises can finish. */
  accountChanged() {
    this.epoch++; this.folderEpoch++; this.pending = {}; this.selectedId = null; this.manualFolder=false; clearTimeout(this.timer);
    const epoch=this.epoch;
    return this.serial(async () => {
      if(epoch!==this.epoch)return;
      this.accountId = await this.ports.account();
      if(epoch!==this.epoch)return;
      try {
        await this.ports.local.set({[selectedSourceKey]:null});
        this.cloud = await this.ports.sync.get(null);
        if(epoch!==this.epoch)return;
        const remote = syncPatch(this.cloud);
        await this.apply(remote);
        if(epoch!==this.epoch)return;
        await this.publish({ error: '', confirm: settingKeys.some(key => !(key in remote)), folder: '' });
        await this.restoreFolder();
      } catch(error) { await this.failure(error); }
    });
  }
  async retry() {
    const epoch=this.epoch;
    const current = await this.ports.account();
    if(epoch!==this.epoch)return;
    if (current !== this.accountId) await this.accountChanged();
    else {
      const values=await this.serial(async () => {
        try {return await this.ports.sync.get(null);}
        catch(error) {await this.failure(error);return null;}
      });
      if(epoch!==this.epoch)return;
      if(values)await this.remote(Object.fromEntries(Object.entries(values).map(([key,newValue])=>[key,{newValue}])));
    }
    await this.bookmarksChanged();
    await this.flush();
  }
  confirmLocal(transfer: boolean) { const epoch=this.epoch;return this.serial(async () => {
    // Read again at the time of confirmation: late cloud data always wins.
    try {
      const remote = await this.ports.sync.get(null);
      if(epoch!==this.epoch)return;
      this.cloud = remote;
      const patch = syncPatch(remote), local = await this.snapshot();
      for(const key of settingKeys){delete this.pending[syncPrefix+key];}
      const upload: Record<string, unknown> = {};
      for (const key of settingKeys) if (!(key in patch)) {
        const value = transfer ? local[key] : defaults[key];
        Object.assign(patch, { [key]: value });
        upload[syncPrefix + key] = value;
      }
      await this.apply(patch);
      if(epoch!==this.epoch)return;
      this.enqueue(upload);
      if(transfer&&remote[folderKey]===undefined){
        const stored=await this.ports.local.get(['rootFolderId']);
        if(typeof stored.rootFolderId==='string')await this.selectFolderInternal(stored.rootFolderId);
      }
      await this.publish({ confirm: false });
    } catch(error) { await this.failure(error); }
  }); }
  dispose() { this.epoch++; this.pending={};clearTimeout(this.timer); }
}
