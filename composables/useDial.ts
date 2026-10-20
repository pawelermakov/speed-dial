import { ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { db } from '../services/database';
import { settingsItem } from '../services/settings';
import { syncRequest } from '../services/syncClient';
import { Repository, withDataLock } from '../services/repository';
import { defaults, type SearchProviderId, type Settings, type Snapshot } from '../types/models';
import { validateSettings } from '../services/validation';
import { faviconBlob } from '../services/favicons';
const rootItem = storage.defineItem<string>('local:rootFolderId');
export const repository = new Repository(db, settingsItem, browser.bookmarks, rootItem);
export function useDial() {
  const snapshot = shallowRef<Snapshot>({ tabs: [], categories: [], rootId: null, activeId: null, settings: { ...defaults }, background: null });
  const loading = ref(true), busy = ref(false), notice = ref('');
  const revision = ref(0);
  const settingErrors = ref<Record<string,string>>({});
  let confirmed: Settings = { ...defaults };
  const pendingFields = new Map<keyof Settings, { version:number; value:Settings[keyof Settings] }>();
  const previews=new Map<keyof Settings,Settings[keyof Settings]>();
  const saves = new Set<Promise<unknown>>();
  let settingsVersion = 0, settingsRead = 0, rootVersion = 0, backgroundVersion = 0;
  let backgroundDirty = true;
  const fieldLabels:Record<keyof Settings,string> = {width:'Ширина',countColumns:'Количество столбцов',space:'Расстояние',verticalCenter:'Центрировать по вертикали',addButton:'Кнопка «+»',bookmarkSearch:'Поиск по закладкам',searchProvider:'Источник поиска',email:'E-mail Mail.ru',uiRadius:'Скругление',uiTransparency:'Прозрачность',uiBlur:'Размытие',uiAccent:'Цвет акцента'};
  function publishSettings() {
    const settings = { ...confirmed };
    for (const [key,entry] of pendingFields) Object.assign(settings,{[key]:entry.value});
    for(const [key,value] of previews)Object.assign(settings,{[key]:value});
    snapshot.value = { ...snapshot.value, settings };
  }
  function track<T>(promise:Promise<T>):Promise<T> { saves.add(promise);void promise.finally(()=>saves.delete(promise)).catch(()=>{});return promise; }
  async function flushSettings() { while(saves.size) await Promise.allSettled([...saves]); await syncRequest('flush'); }
  const channel = new BroadcastChannel('speed-dial-updates');
  let generation = 0, timer: ReturnType<typeof setTimeout> | undefined, disposed = false;
  const attempted = new Set<string>();
  const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
  const refresh = async () => {
    const sequence = ++generation;
    const includeBackground = backgroundDirty;
    const next = await withDataLock(() => repository.load(includeBackground));
    if (sequence !== generation || disposed) return;
    if (includeBackground) backgroundDirty = false;
    confirmed = next.settings;
    snapshot.value = { ...next, background:includeBackground ? next.background : snapshot.value.background };
    publishSettings();
    if (next.rootNotice) { notice.value = next.rootNotice;settingErrors.value={...settingErrors.value,root:next.rootNotice}; repository.clearSourceNotice?.(); }
    for (const tab of next.tabs.filter(tab => !tab.favicon)) {
      const key = tab.id + tab.url;
      if (attempted.has(key)) continue; attempted.add(key);
      void faviconBlob(tab.url).then(async blob => {
        if (!blob || disposed) return;
        await repository.cache(tab.id, tab.url, 'favicon', blob);
        schedule(); channel.postMessage({type:'updated'});
      }).catch(() => {});
    }
  };
  const schedule = () => { generation++; revision.value++; clearTimeout(timer); timer = setTimeout(() => { void refresh().catch(error => { notice.value = errorText(error); }); }, 60); };
  const run = async (operation: () => Promise<unknown>, changesBackground = false): Promise<boolean> => {
    if (busy.value || loading.value) return false;
    busy.value = true;
    try { await flushSettings();await withDataLock(operation);if(changesBackground){backgroundDirty=true;settingErrors.value={};}await refresh(); channel.postMessage({type:'updated',background:changesBackground}); return true; }
    catch (error) { notice.value = errorText(error);if(changesBackground)backgroundDirty=true;await refresh().catch(() => {});return false; }
    finally { busy.value = false; }
  };
  const updateSettings = (patch: Partial<Settings>): Promise<boolean> => {
    if (busy.value || loading.value) return Promise.resolve(false);
    const version = ++settingsVersion, keys=Object.keys(patch) as Array<keyof Settings>;
    try { validateSettings({...snapshot.value.settings,...patch}); }
    catch(error) { settingErrors.value={...settingErrors.value,settings:errorText(error)};return Promise.resolve(false); }
    for(const key of keys) { previews.delete(key);pendingFields.set(key,{version,value:patch[key]!});delete settingErrors.value[key]; }
    publishSettings();
    return track((async()=>{
      try { const next=await withDataLock(()=>repository.patchSettings(patch));confirmed=next;return true; }
      catch(error) {
        for(const key of keys)if(pendingFields.get(key)?.version===version&&!previews.has(key))settingErrors.value={...settingErrors.value,[key]:fieldLabels[key]+': не удалось сохранить. '+errorText(error)};
        return false;
      } finally {
        for(const key of keys)if(pendingFields.get(key)?.version===version)pendingFields.delete(key);
        if(!disposed)publishSettings();
      }
    })());
  };
  function previewSettings(patch:Partial<Settings>){
    const validated=validateSettings({...snapshot.value.settings,...patch});
    for(const key of Object.keys(patch) as Array<keyof Settings>)previews.set(key,validated[key]);
    publishSettings();
  }
  const changeSearchProvider = (searchProvider:SearchProviderId) => updateSettings({searchProvider});
  const changeRoot = (id:string):Promise<boolean> => {
    const version=++rootVersion;
    return track((async()=>{try{await withDataLock(()=>repository.selectRoot(id));if(version===rootVersion){void syncRequest('folder',id);delete settingErrors.value.root;await refresh();channel.postMessage({type:'updated'});}return true;}
      catch(error){if(version===rootVersion){settingErrors.value={...settingErrors.value,root:'Папка закладок: не удалось сохранить. '+errorText(error)};await refresh().catch(()=>{});}return false;}})());
  };
  const changeBackground = (blob:Blob|null):Promise<boolean> => {
    const version=++backgroundVersion;
    return track((async()=>{try{await withDataLock(()=>repository.saveBackground(blob));if(version===backgroundVersion){snapshot.value={...snapshot.value,background:blob};delete settingErrors.value.background;channel.postMessage({type:'updated',background:true});}return true;}
      catch(error){if(version===backgroundVersion)settingErrors.value={...settingErrors.value,background:'Фон: не удалось сохранить. '+errorText(error)};return false;}})());
  };
  channel.onmessage = event => {
    if(event.data?.background || event.data==='updated')backgroundDirty=true;
    schedule();
  };
  const unwatchSettings = settingsItem.watch?.(() => {
    const sequence=++settingsRead;
    void withDataLock(async()=>validateSettings((await settingsItem.getValue())?.value)).then(next=>{
      if(disposed || sequence!==settingsRead)return;
      confirmed=next;publishSettings();
    }).catch(error=>{notice.value=errorText(error);});
  });
  const unwatchRoot = rootItem.watch(async id => {
    if (disposed || id === repository.rootId) return;
    try {
      const changed = await withDataLock(async () => {
        if (disposed || id === repository.rootId) return false;
        generation++;
        await repository.adoptRoot(id);
        return true;
      });
      if (changed) schedule();
    } catch (error) { notice.value = errorText(error); schedule(); }
  });
  const api = browser.bookmarks;
  const events = [api?.onCreated, api?.onRemoved, api?.onChanged, api?.onMoved, api?.onChildrenReordered, api?.onImportEnded];
  const bookmarkEvent = () => { attempted.clear(); schedule(); };
  const tabUpdated = (_id: number, change: { favIconUrl?: string }) => { if (change.favIconUrl) { attempted.clear(); schedule(); } };
  events.forEach(event => event?.addListener(bookmarkEvent));
  browser.tabs?.onUpdated?.addListener(tabUpdated);
  onMounted(async () => {
    // Wallpaper should not wait for sync and the bookmark tree.
    const initialBackgroundVersion=backgroundVersion;
    void db.assets.get('background').then(asset=>{
      if(!disposed && backgroundDirty && backgroundVersion===initialBackgroundVersion)
        snapshot.value={...snapshot.value,background:asset?.blob??null};
    }).catch(()=>{}); // The regular refresh reports storage errors.
    try {
      if (!api) throw new Error('Bookmarks API недоступен. Проверьте разрешение «Закладки» и переустановите расширение.');
      await syncRequest('initialize');
      const initial = await withDataLock(() => repository.initialize());
      if (initial?.rootNotice) notice.value = initial.rootNotice;
      await refresh();
    } catch (error) { notice.value = 'Не удалось открыть закладки. Проверьте разрешение расширения. ' + errorText(error); }
    finally { loading.value = false; }
  });
  onUnmounted(() => { unwatchRoot();unwatchSettings?.(); disposed = true; generation++; clearTimeout(timer); events.forEach(event => event?.removeListener(bookmarkEvent)); browser.tabs?.onUpdated?.removeListener(tabUpdated); channel.close(); });
  const announce = () => channel.postMessage({type:'updated'});
  return { snapshot, loading, busy, notice, run, refresh, announce, revision, changeSearchProvider, updateSettings, changeRoot, changeBackground, flushSettings, settingErrors,previewSettings };
}
