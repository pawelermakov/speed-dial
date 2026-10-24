import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ mounted: [] as Array<()=>Promise<void>>, unmounted: [] as Array<()=>void>, listeners: new Set<()=>void>(), background: vi.fn(), load: vi.fn(), initialize: vi.fn(), close: vi.fn(), watch: vi.fn(() => () => {}), post: vi.fn() }));
vi.mock('vue', async () => { const actual = await vi.importActual<typeof import('vue')>('vue'); return { ...actual, onMounted: (callback: ()=>Promise<void>) => state.mounted.push(callback), onUnmounted: (callback: ()=>void) => state.unmounted.push(callback) }; });
vi.mock('wxt/browser', () => { const event = { addListener: (fn: ()=>void) => state.listeners.add(fn), removeListener: (fn: ()=>void) => state.listeners.delete(fn) }; return { browser: { bookmarks: { onCreated:event,onChanged:event,onRemoved:event,onMoved:event,onChildrenReordered:event,onImportEnded:event } } }; });
vi.mock('wxt/utils/storage', () => ({ storage: { defineItem: () => ({ watch: state.watch }) } }));
vi.mock('../services/database', () => ({ db: {assets:{get:state.background}} }));
vi.mock('../services/settings', () => ({ settingsItem: {} }));
vi.mock('../services/syncClient', () => ({ syncRequest: vi.fn(async()=>{}) }));
vi.mock('../services/favicons', () => ({ faviconBlob: vi.fn(async () => null) }));
vi.mock('../services/repository', () => ({ Repository: class { load = state.load; initialize = state.initialize; }, withDataLock: (fn: ()=>Promise<unknown>) => fn() }));
import { useDial, repository } from '../composables/useDial';
import { defaults } from '../types/models';
const snapshot = (title: string) => ({ tabs: [{ id:'x', parentId:'root', title, url:'https://example.com/', index:0, favicon:null, thumbnail:null }], folders:[],rootId:'root',activeId:'root',settings:defaults,background:null });
beforeEach(() => { vi.useFakeTimers(); state.mounted.length=0;state.unmounted.length=0;state.listeners.clear();state.background.mockReset().mockResolvedValue(undefined);state.load.mockReset().mockResolvedValue(snapshot('Initial'));state.initialize.mockReset().mockResolvedValue(undefined);vi.stubGlobal('BroadcastChannel',class { postMessage=state.post; close=state.close; onmessage=null; });vi.stubGlobal('navigator',{}); });
afterEach(() => { state.unmounted.forEach(callback=>callback());vi.useRealTimers();vi.unstubAllGlobals(); });
describe('browser event refresh lifecycle', () => {
 it('refreshes asset-only broadcasts without invalidating a drag, but invalidates structural updates',async()=>{
   const channels:Array<{onmessage:((event:{data:unknown})=>void)|null}>=[];
   vi.stubGlobal('BroadcastChannel',class {onmessage:((event:{data:unknown})=>void)|null=null;postMessage=state.post;close=state.close;constructor(){channels.push(this);}});
   const dial=useDial();await state.mounted[0]!();state.load.mockClear();
   channels[0]!.onmessage!({data:{type:'updated',assets:true}});await vi.advanceTimersByTimeAsync(60);
   expect(state.load).toHaveBeenCalled();expect(dial.revision.value).toBe(0);
   channels[0]!.onmessage!({data:{type:'updated'}});expect(dial.revision.value).toBe(1);
   [...state.listeners][0]!();expect(dial.revision.value).toBe(2);
 });

 it('loads wallpaper while bookmark initialization is still pending',async()=>{
   const blob=new Blob(['wallpaper']);state.background.mockResolvedValue({blob});
   let finish!:()=>void;state.initialize.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
   const dial=useDial(),startup=state.mounted[0]!();
   await vi.advanceTimersByTimeAsync(0);
   expect(dial.loading.value).toBe(true);expect(dial.snapshot.value.background).toBe(blob);expect(state.load).not.toHaveBeenCalled();
   finish();await startup;
 });
 it('ignores an obsolete wallpaper startup read after a complete refresh',async()=>{
   let finish!:(value:{blob:Blob})=>void;state.background.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
   const current=new Blob(['current']);state.load.mockResolvedValue({...snapshot('Initial'),background:current});
   const dial=useDial();await state.mounted[0]!();finish({blob:new Blob(['old'])});await Promise.resolve();
   expect(dial.snapshot.value.background).toBe(current);
 });
 it('saves current fields and rolls back failed writes',async()=>{
   const dial=useDial();await state.mounted[0]!();
   repository.patchSettings=vi.fn().mockResolvedValue({...defaults,width:75});
   expect(await dial.updateSettings({width:75})).toBe(true);expect(repository.patchSettings).toHaveBeenCalledWith({width:75});
   repository.patchSettings=vi.fn().mockRejectedValue(new Error('write denied'));
   expect(await dial.updateSettings({space:12})).toBe(false);expect(dial.snapshot.value.settings.space).toBe(defaults.space);
 });
 it('a failed background write preserves the current image and exposes a persistent error',async()=>{
   const initial={...snapshot('Initial'),background:new Blob(['old image'])};state.load.mockResolvedValueOnce(initial);
   const dial=useDial();await state.mounted[0]!();
   repository.saveBackground=vi.fn().mockRejectedValue(new Error('disk full'));
   expect(await dial.changeBackground(new Blob(['new image']))).toBe(false);
   expect(dial.snapshot.value.background).toBe(initial.background);
   expect(dial.settingErrors.value.background).toContain('Фон');
 });
 it('does not let an earlier failed field write undo a later edit or unrelated fields',async()=>{
   const dial=useDial();await state.mounted[0]!();
   let rejectOld!:(error:Error)=>void;
   repository.patchSettings=vi.fn().mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectOld=reject;})).mockResolvedValueOnce({...defaults,width:90,space:12});
   const old=dial.updateSettings({width:80});
   const latest=dial.updateSettings({width:90,space:12});
   await latest;rejectOld(new Error('old failure'));await old;
   expect(dial.snapshot.value.settings).toMatchObject({width:90,space:12});
   expect(dial.settingErrors.value).toEqual({});
 });
 it('rolls a failed latest field back and retains its named error',async()=>{
   const dial=useDial();await state.mounted[0]!();
   repository.patchSettings=vi.fn().mockRejectedValue(new Error('storage failed'));
   expect(await dial.updateSettings({width:80})).toBe(false);
   expect(dial.snapshot.value.settings.width).toBe(100);
   expect(dial.settingErrors.value.width).toContain('Ширина');
   state.load.mockClear();await dial.refresh();expect(state.load).toHaveBeenCalledWith(false);
 });
 it('saves the search provider without reloading assets or disabling the page', async () => {
   const save = vi.fn(async (patch:Partial<typeof defaults>) => ({...defaults,...patch}));
   repository.patchSettings = save;
   const dial = useDial(); await state.mounted[0]!();
   const before = dial.snapshot.value;
   state.load.mockClear();
   const pending = dial.changeSearchProvider('google');
   expect(dial.busy.value).toBe(false);
   expect(await pending).toBe(true);
   expect(save).toHaveBeenCalledWith({searchProvider:'google'});
   expect(state.load).not.toHaveBeenCalled();
   expect(dial.snapshot.value.tabs).toBe(before.tabs);
   expect(dial.snapshot.value.background).toBe(before.background);
   expect(dial.snapshot.value.settings.searchProvider).toBe('google');
   save.mockRejectedValueOnce(new Error('write failed'));
   expect(await dial.changeSearchProvider('imdb')).toBe(false);
   expect(dial.snapshot.value.settings.searchProvider).toBe('google');
   expect(state.load).not.toHaveBeenCalled();
 });
 it('disabling bookmark search saves its web fallback with the same patch',async()=>{
   const dial=useDial();await state.mounted[0]!();
   dial.snapshot.value={...dial.snapshot.value,settings:{...defaults,searchProvider:'bookmarks'}};
   const save=vi.fn(async(patch:Partial<typeof defaults>)=>({...defaults,...patch}));repository.patchSettings=save;
   await dial.updateSettings({bookmarkSearch:false});
   expect(save).toHaveBeenCalledWith({bookmarkSearch:false,searchProvider:'yandex'});
   expect(dial.snapshot.value.settings).toMatchObject({bookmarkSearch:false,searchProvider:'yandex'});
 });
 it.each(['kinopoisk','imdb','myshows'] as const)('disabling movie search saves a fallback for %s',async searchProvider=>{
   const dial=useDial();await state.mounted[0]!();
   dial.snapshot.value={...dial.snapshot.value,settings:{...defaults,movieSearch:true,searchProvider}};
   const save=vi.fn(async(patch:Partial<typeof defaults>)=>({...defaults,...patch}));repository.patchSettings=save;
   await dial.updateSettings({movieSearch:false});
   expect(save).toHaveBeenCalledWith({movieSearch:false,searchProvider:'yandex'});
 });
 it('coalesces fast bookmark events and unsubscribes on teardown', async () => { const dial=useDial();await state.mounted[0]!();state.load.mockClear().mockResolvedValue(snapshot('External'));for(let i=0;i<15;i++)state.listeners.forEach(callback=>callback());await vi.advanceTimersByTimeAsync(65);expect(state.load).toHaveBeenCalledTimes(1);expect(dial.snapshot.value.tabs[0]?.title).toBe('External');state.unmounted.forEach(callback=>callback());expect(state.listeners.size).toBe(0); });
 it('slow older reads cannot overwrite a newer view', async () => { const dial=useDial();await state.mounted[0]!();let resolveOld!: (value:ReturnType<typeof snapshot>)=>void;state.load.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValueOnce(snapshot('New'));const old=dial.refresh();await dial.refresh();resolveOld(snapshot('Old'));await old;expect(dial.snapshot.value.tabs[0]?.title).toBe('New'); });
 it('mutation failure rereads actual browser state', async () => { const dial=useDial();await state.mounted[0]!();state.load.mockResolvedValue(snapshot('Actual'));expect(await dial.run(async()=>{throw new Error('move failed');})).toBe(false);expect(dial.snapshot.value.tabs[0]?.title).toBe('Actual');expect(dial.notice.value).toBe('move failed'); });
 it('does not publish a read after unmount', async () => { const dial=useDial();await state.mounted[0]!();let finish!: (value:ReturnType<typeof snapshot>)=>void;state.load.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const pending=dial.refresh();state.unmounted.forEach(callback=>callback());finish(snapshot('Late'));await pending;expect(dial.snapshot.value.tabs[0]?.title).toBe('Initial'); });
});
