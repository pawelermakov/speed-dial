import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialDatabase } from '../services/database';
import { Repository } from '../services/repository';
import { MockBookmarks } from './bookmarksMock';
import type { RootPort } from '../services/bookmarks';
import type { SettingsEnvelope, SettingsPort } from '../services/settings';
import { defaults } from '../types/models';
let settingsPort: SettingsPort, rootPort: RootPort;
let db: DialDatabase, api: MockBookmarks, repo: Repository, stored: SettingsEnvelope | null, rootId: string | null;
beforeEach(() => {
  db = new DialDatabase('test-' + crypto.randomUUID()); api = new MockBookmarks(); stored = null; rootId = null;
  settingsPort = { getValue: async () => stored, setValue: async value => { stored = value; } };
  rootPort = { getValue: async () => rootId, setValue: async id => { rootId = id; } };
  repo = new Repository(db, settingsPort, api, rootPort);
});
afterEach(async () => { await db.delete(); });
async function setup() { const node = await api.create({parentId:'other',title:'Speed Dial'}); await repo.selectRoot(node.id); }
const add = (url = 'https://example.com/') => repo.add({ url, title: 'Свой заголовок' });
describe('browser bookmarks source', () => {
  it('ignores native Firefox separators with data URLs and preserves their slots when sorting', async () => {
    await setup();const root=repo.rootId!;
    const a=await add('https://a.example/');
    const separator=await api.create({parentId:root,title:'',url:'data:'});
    api.nodes.get(separator.id)!.type='separator';
    const b=await add('https://b.example/');
    expect((await repo.load()).tabs.map(row=>row.id)).toEqual([a,b]);
    expect((await repo.load()).folders.map(row=>row.id)).toEqual([root]);
    expect(await repo.search('data:')).toEqual([]);
    expect((await repo.exportData()).entries).toHaveLength(2);
    await expect(repo.bookmark(separator.id)).rejects.toThrow('Закладка недоступна');
    await expect(repo.parent(separator.id)).rejects.toThrow('Папка');
    await repo.reorder([b,a], [a,b], root);
    expect((await api.getChildren(root)).map(row=>row.id)).toEqual([b,separator.id,a]);
  });
  it('an older folder read cannot reset the latest requested folder',async()=>{
    await setup();const a=await api.create({parentId:repo.rootId!,title:'A'}),b=await api.create({parentId:repo.rootId!,title:'B'});
    const original=api.getChildren.bind(api);let release!:(value:Awaited<ReturnType<typeof api.getChildren>>)=>void;
    vi.spyOn(api,'getChildren').mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    repo.selectFolder(a.id);const old=repo.load(false);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    repo.selectFolder(b.id);release(await original(repo.rootId!));await old;
    expect(repo.activeId).toBe(b.id);expect((await repo.load(false)).activeId).toBe(b.id);
  });
  it('patches only current keys and does not reload background for bookmark-only reads',async()=>{
    await setup();await repo.patchSettings({width:80});
    const peer=new Repository(db,settingsPort,api,rootPort);
    await peer.patchSettings({space:12});await repo.patchSettings({searchProvider:'google'});
    expect(stored?.value).toMatchObject({width:80,space:12,searchProvider:'google'});
    const get=vi.spyOn(db.assets,'get');await repo.load(false);expect(get).not.toHaveBeenCalled();
    await repo.load();expect(get).toHaveBeenCalledWith('background');
    await expect(repo.patchSettings({width:999})).rejects.toThrow();
    expect(stored?.value.width).toBe(80);
  });
  it('saves the search provider without overwriting current preferences or changing the bookmark source',async()=>{
    await setup();const source=repo.rootId;const bookmark=await add();
    await repo.saveSettings({...defaults,width:75,bookmarkSearch:false,movieSearch:true});
    await repo.saveSearchProvider('imdb');
    expect((await repo.load()).settings).toEqual({...defaults,width:75,bookmarkSearch:false,movieSearch:true,searchProvider:'imdb'});
    expect(repo.rootId).toBe(source);expect((await repo.load()).tabs[0]?.id).toBe(bookmark);
  });
  it('enables bookmark search by default and persists an explicit opt-out', async () => {
    await setup();
    stored = { value:{...defaults} };
    expect((await repo.load()).settings.bookmarkSearch).toBe(true);
    const write=vi.spyOn(settingsPort,'setValue');
    await repo.saveSettings({...defaults},undefined,repo.rootId!);
    expect(write).not.toHaveBeenCalled();
    await repo.saveSettings({...defaults,bookmarkSearch:false});
    expect((await repo.load()).settings.bookmarkSearch).toBe(false);
    await repo.reset();expect((await repo.load()).settings.bookmarkSearch).toBe(true);
  });
  it('searches titles and URLs in root and direct folders without changing active folder or bookmarks', async () => {
    await setup(); const root=repo.rootId!;
    const direct=await api.create({parentId:root,title:'MATCH root',url:'https://root.example/'});
    const a=await api.create({parentId:root,title:'Work'}), b=await api.create({parentId:root,title:'Personal'});
    const first=await api.create({parentId:a.id,title:'First',url:'https://example.com/MATCH'});
    const second=await api.create({parentId:b.id,title:'Match second',url:'https://second.example/'});
    const deep=await api.create({parentId:a.id,title:'Hidden'});
    await api.create({parentId:deep.id,title:'Match hidden',url:'https://hidden.example/'});
    repo.activeId=b.id;
    const tree=await api.getTree();
    const results=await repo.search('  mAtCh  ');
    expect(results.map(row=>[row.id,row.parentId])).toEqual([[direct.id,root],[first.id,a.id],[second.id,b.id]]);
    expect(repo.activeId).toBe(b.id);expect(await api.getTree()).toEqual(tree);
    expect(await repo.search('  ')).toEqual([]);expect(await repo.search('missing')).toEqual([]);
  });
  it('search rereads external edits and never reuses images for an updated URL', async () => {
    await setup();const id=await add('https://example.com/match');
    await repo.cache(id,'https://example.com/match','thumbnail',new Blob(['image'],{type:'image/png'}));
    expect((await repo.search('match'))[0]?.thumbnail).toBeTruthy();
    await api.update(id,{url:'https://other.example/match',title:'Changed'});
    expect((await repo.search('match'))[0]).toMatchObject({title:'Changed',url:'https://other.example/match',thumbnail:null});
    await api.remove(id);expect(await repo.search('match')).toEqual([]);
  });
  it('propagates search read failures and handles a missing source', async () => {
    expect(await repo.search('match')).toEqual([]);await setup();
    vi.spyOn(api,'getSubTree').mockRejectedValueOnce(new Error('read failed'));
    await expect(repo.search('match')).rejects.toThrow('read failed');
  });
  it('preserves a valid saved source across updates and renames', async () => {
    await setup(); const id=repo.rootId!; await add();
    await api.update(id,{title:'Моя папка'});
    const write = vi.spyOn(rootPort,'setValue');
    expect((await repo.initialize()).rootId).toBe(id);
    expect(write).not.toHaveBeenCalled();
  });
  it('never mutates bookmarks or unrelated preferences when changing source A→B→A', async () => {
    await setup(); const a=repo.rootId!; const id=await add();
    await repo.cache(id,'https://example.com/','thumbnail',new Blob(['image'],{type:'image/png'}));
    const b=await api.create({parentId:'other',title:'B'});
    const tree=await api.getTree();
    const mutations = ['create','update','move','remove','removeTree'].map(name=>vi.spyOn(api,name as 'create'));
    const preferences=vi.spyOn(settingsPort,'setValue');
    for(const source of [b.id,a]) await repo.saveSettings({...defaults},undefined,source);
    expect((await repo.load()).tabs[0]?.thumbnail).toBeTruthy();
    expect(await api.getTree()).toEqual(tree);
    mutations.forEach(spy=>expect(spy).not.toHaveBeenCalled());
    expect(preferences).not.toHaveBeenCalled();
  });
  it('creates no folder during first initialization', async () => {
    const mutations = ['create','update','move','remove','removeTree'].map(name=>vi.spyOn(api,name as 'create'));
    expect((await repo.initialize()).rootId).toBe('other');
    expect(rootId).toBe('other');
    mutations.forEach(spy=>expect(spy).not.toHaveBeenCalled());
  });
  it('does not choose an arbitrary Other source when the tree is ambiguous', async () => {
    api.nodes.set('second-other',{id:'second-other',parentId:'root',title:'Other',folderType:'other',syncing:true});
    expect((await repo.initialize()).rootId).toBeNull();
    expect(rootId).toBeNull();
  });
  it('falls back after a selected folder becomes managed, with a clear notice', async () => {
    await setup(); const root=repo.rootId!;
    api.nodes.get(root)!.unmodifiable='managed';
    const result=await repo.load();
    expect(result.rootId).toBe('other');
    expect(result.rootNotice).toContain('недоступна');
    expect((await api.get(root))[0]).toBeTruthy();
  });
  it('keeps the recovery notice until a view consumes it, including another tab adoption', async () => {
    await setup(); const old=repo.rootId!;
    await api.removeTree(old);
    await repo.adoptRoot('other');
    expect((await repo.load()).rootNotice).toContain('недоступна');
    expect((await repo.load()).rootNotice).toContain('Другие закладки');
    repo.clearSourceNotice();
    expect((await repo.load()).rootNotice).toBeUndefined();
  });
  it('rolls back visual settings and background if persisting the new source fails', async () => {
    await setup(); const initial=repo.rootId;
    const oldBackground=new Blob(['old']);
    await db.assets.put({key:'background',blob:oldBackground});
    vi.spyOn(rootPort,'setValue').mockRejectedValueOnce(new Error('Storage failure'));
    await expect(repo.saveSettings({...defaults,width:50},new Blob(['new']),'other')).rejects.toThrow('Storage failure');
    expect(rootId).toBe(initial); expect(repo.rootId).toBe(initial);
    expect((await settingsPort.getValue())?.value).toEqual(defaults);
    expect(await (await db.assets.get('background'))!.blob.text()).toBe('old');
  });
  it('does not switch roots when settings or tree access fails', async () => {
    await setup(); const initial=repo.rootId;
    const write=vi.spyOn(rootPort,'setValue');
    vi.spyOn(settingsPort,'setValue').mockRejectedValueOnce(new Error('Settings failure'));
    await expect(repo.saveSettings({...defaults,width:50},undefined,'other')).rejects.toThrow('Settings failure');
    expect(write).not.toHaveBeenCalled(); expect(rootId).toBe(initial);
    vi.spyOn(api,'getTree').mockRejectedValueOnce(new Error('Permission denied'));
    await expect(repo.saveSettings({...defaults},undefined,'other')).rejects.toThrow('Permission denied');
    expect(rootId).toBe(initial);
  });
  it('allows child CRUD in system folders while protecting the system folder itself', async () => {
    await repo.initialize(); const id=await add();
    await repo.createFolder('A');
    const folder=(await api.getChildren('other')).find(row=>!row.url)!;
    await repo.edit(id,'https://example.com/','Moved',folder.id);
    await repo.renameFolder(folder.id,'B');
    await expect(repo.removeFolder('other')).rejects.toThrow();
    await expect(repo.renameFolder('other','Wrong')).rejects.toThrow();
    await repo.removeFolder(folder.id);
    expect(await api.getChildren('other')).toEqual([]);
  });
  it('keeps the current folder when saving visual preferences for the same source', async () => {
    await setup(); await repo.createFolder('A');
    repo.activeId=(await api.getChildren(repo.rootId!))[0]!.id;
    const active=repo.activeId;
    await repo.saveSettings({...defaults,width:75},undefined,repo.rootId!);
    expect(repo.activeId).toBe(active);
  });
  it('unavailable or corrupt image cache never hides browser bookmarks', async () => { await setup(); const id = await add(); await db.tileAssets.put({bookmarkId:id,url:'https://example.com/',thumbnail:new Blob(['<svg/>'],{type:'image/svg+xml'})}); expect((await repo.load()).tabs[0]?.thumbnail).toBeNull(); vi.spyOn(db.tileAssets,'get').mockRejectedValue(new Error('IDB unavailable')); expect((await repo.load()).tabs[0]?.id).toBe(id); });
  it('uses Other without creating or searching for Speed Dial', async () => { expect((await repo.initialize()).rootId).toBe('other'); expect(await api.getChildren('other')).toEqual([]); });
  it('uses Other for a stale saved ID without adopting a same-named folder', async () => { await api.create({ parentId:'other',title:'Speed Dial' }); rootId='stale'; expect((await repo.initialize()).rootId).toBe('other'); });
  it('does not merge duplicate names or local/account branches', async () => { await api.create({ parentId: 'other', title: 'Speed Dial' }); await api.create({ parentId: 'other', title: 'Speed Dial' }); expect((await repo.initialize()).rootId).toBe('other'); });
  it('distinguishes account/local branches without relying on fixed IDs', async () => { const local=await api.create({parentId:'root',title:'Local'});Object.assign(api.nodes.get(local.id)!,{folderType:'other',syncing:false});await api.create({parentId:'other',title:'Speed Dial'});await api.create({parentId:local.id,title:'Speed Dial'});const choices=await repo.choices();expect(choices.find(node=>node.id==='other')?.path).toContain('аккаунт');expect(choices.find(node=>node.id===local.id)?.path).toContain('локально');expect((await repo.initialize()).rootId).toBe('other'); });
  it('protects technical, standard and managed folders', async () => { await expect(repo.selectRoot('root')).rejects.toThrow(); await expect(repo.selectRoot('other')).resolves.toBeUndefined(); const managed = await api.create({ parentId: 'other', title: 'Managed' }); api.nodes.get(managed.id)!.unmodifiable = 'managed'; const nested = await api.create({ parentId: managed.id, title: 'Nested' }); await expect(repo.selectRoot(nested.id)).rejects.toThrow(); });
  it('rejects unavailable API instead of presenting an empty source', async () => { vi.spyOn(api, 'getTree').mockRejectedValue(new Error('Permission denied')); await expect(repo.initialize()).rejects.toThrow('Permission'); });
  it('shows direct bookmarks without folders and with empty cache', async () => { await setup(); const id = await add(); await db.tileAssets.clear(); const state = await repo.load(); expect(state.folders).toEqual([{id:repo.rootId,title:'Speed Dial',index:-1,virtual:true}]); expect(state.tabs[0]).toMatchObject({ id, thumbnail: null, favicon: null }); });
  it('handles mixed, only-folder, empty and deep structures', async () => {
    await setup(); expect((await repo.load()).tabs).toEqual([]);
    const direct = await add(); await repo.createFolder('Главная'); const folder = (await api.getChildren(repo.rootId!)).find(node => !node.url)!;
    const deep = await api.create({ parentId: folder.id, title: 'Deep' }); await api.create({ parentId: deep.id, title: 'Hidden', url: 'https://hidden.example' });
    const state = await repo.load(); expect(state.folders.map(node => node.title)).toEqual(['Speed Dial', 'Главная']); expect(state.activeId).toBe(folder.id);repo.selectFolder(repo.rootId!);expect((await repo.load()).tabs.map(node=>node.id)).toEqual([direct]);
    repo.activeId = folder.id; expect((await repo.load()).tabs).toEqual([]);
    await api.remove(direct); expect((await repo.load()).folders.length).toBe(2); expect((await api.getChildren(deep.id)).length).toBe(1);
  });
  it('CRUD, moves, cache and reset preserve browser source and custom titles', async () => {
    await setup(); const id = await add(); const image = new Blob(['image'], { type: 'image/png' }); await repo.cache(id, 'https://example.com/', 'thumbnail', image);
    await repo.edit(id, 'https://example.com/', 'Edited'); expect((await repo.load()).tabs[0]?.thumbnail).toBeTruthy();
    await repo.createFolder('Work'); const folder = (await api.getChildren(repo.rootId!)).find(node => !node.url)!;
    await repo.edit(id, 'https://example.com/', 'Edited', folder.id); repo.activeId = folder.id;
    expect((await repo.load()).tabs[0]?.title).toBe('Edited'); expect((await repo.load()).tabs[0]?.thumbnail).toBeTruthy();
    await repo.reset(); expect((await repo.load()).tabs[0]?.id).toBe(id); expect((await repo.load()).settings).toEqual(defaults);
    await repo.remove(id); expect((await repo.load()).tabs).toEqual([]);
  });
  it('ignores stale assets on URL change, keeps them on external move/title change', async () => {
    await setup(); const id = await add(); const image = new Blob(['image'], { type: 'image/png' }); await repo.cache(id, 'https://example.com/', 'favicon', image);
    await api.update(id, { title: 'External' }); expect((await repo.load()).tabs[0]?.favicon).toBeTruthy();
    await api.move(id, { parentId: 'other' }); expect((await repo.load()).tabs).toEqual([]); expect(await db.tileAssets.get([id, 'https://example.com/'])).toBeTruthy();
    await expect(repo.edit(id, 'https://bad.example/', 'Wrong')).rejects.toThrow();
    await api.move(id, { parentId: repo.rootId! }); await api.update(id, { url: 'https://new.example/' }); expect((await repo.load()).tabs[0]?.favicon).toBeNull();
    await expect(repo.cache(id, 'https://example.com/', 'thumbnail', image)).rejects.toThrow(); await api.remove(id); await expect(repo.cache(id, 'https://new.example/', 'thumbnail', image)).rejects.toThrow();
  });
  it('independent image updates never overwrite other resources', async () => { await setup(); const id = await add(); const image = new Blob(['a'], { type: 'image/png' }); await Promise.all([repo.cache(id, 'https://example.com/', 'thumbnail', image), repo.cache(id, 'https://example.com/', 'favicon', image)]); expect((await repo.load()).tabs[0]).toMatchObject({ thumbnail: expect.any(Blob), favicon: expect.any(Blob), title: 'Свой заголовок' }); await expect(repo.cache(id, 'https://example.com/', 'favicon', new Blob(['<svg/>'], { type: 'image/svg+xml' }))).rejects.toThrow(); });
  it('reorders beginning/middle/end and rejects changed lists; failure leaves actual order', async () => {
    await setup(); const ids = [await add(), await add('https://b.example'), await add('https://c.example')];
    await repo.reorder([ids[2]!, ids[0]!, ids[1]!]); expect((await repo.load()).tabs.map(node => node.id)).toEqual([ids[2], ids[0], ids[1]]);
    await repo.reorder(ids); expect((await repo.load()).tabs.map(node => node.id)).toEqual(ids);
    await expect(repo.reorder([ids[0]!, ids[0]!])).rejects.toThrow();
    vi.spyOn(api, 'move').mockRejectedValueOnce(new Error('move failed')); await expect(repo.reorder(ids.slice().reverse())).rejects.toThrow(); expect((await repo.load()).tabs.length).toBe(3);
  });
  it('keeps a named virtual root for empty trees, disambiguates only equal names and follows external renames', async () => {
    await setup();
    expect((await repo.load()).folders).toEqual([{id:repo.rootId,title:'Speed Dial',index:-1,virtual:true}]);
    await repo.createFolder('Speed Dial'); const selected=repo.activeId;
    await repo.createFolder('Главная');
    expect((await repo.load()).folders.map(row=>row.title)).toEqual(['Speed Dial','Speed Dial (папка)','Главная']);
    await api.update(repo.rootId!,{title:'Работа'});
    expect((await repo.load()).folders.map(row=>row.title)).toEqual(['Работа','Speed Dial','Главная']);
    repo.selectFolder(selected!); await api.removeTree(selected!);
    expect((await repo.load()).activeId).toBe(repo.rootId);
  });
  it('preserves folder slots during bookmark sorting and bookmark slots during folder sorting', async () => {
    await setup(); const a=await add();
    await repo.createFolder('Folder'); const folder=repo.activeId!;
    repo.selectFolder(repo.rootId!); const b=await add('https://b.example'),c=await add('https://c.example');
    await repo.reorder([c,b,a],[a,b,c]);
    expect((await api.getChildren(repo.rootId!)).map(row=>row.id)).toEqual([c,folder,b,a]);
    await repo.createFolder('Second'); const second=repo.activeId!;
    const calls=vi.spyOn(api,'move'); await repo.reorderFolders([second,folder],[folder,second]);
    expect((await api.getChildren(repo.rootId!)).map(row=>row.id)).toEqual([c,second,b,a,folder]);
    expect(calls.mock.calls.every(([id])=>id===folder||id===second)).toBe(true);
    calls.mockClear();await repo.reorderFolders([second,folder],[second,folder]);expect(calls).not.toHaveBeenCalled();
    await expect(repo.reorderFolders([folder,second],[folder,second])).rejects.toThrow('Список изменился');
    expect(calls).not.toHaveBeenCalled();
  });
  it('stops a partially completed reorder on API failure and rejects stale folder context', async () => {
    await setup();const ids=[await add(),await add('https://b.example'),await add('https://c.example')];
    const move=api.move.bind(api);let count=0;
    vi.spyOn(api,'move').mockImplementation(async(id,destination)=>{if(++count===2)throw Error('partial');return move(id,destination);});
    await expect(repo.reorder(ids.slice().reverse(),ids)).rejects.toThrow('partial');
    expect((await repo.load()).tabs.map(row=>row.id)).toEqual([ids[2],ids[0],ids[1]]);
    const parent=repo.activeId;await repo.createFolder('Changed');
    await expect(repo.reorder(ids,ids,parent)).rejects.toThrow('Папка изменилась');
  });
  it('accounts for Chromium destination indices before removing a sibling', async () => {
    await setup();const a=await add();await repo.createFolder('Folder');const folder=repo.activeId!;repo.selectFolder(repo.rootId!);
    const b=await add('https://b.example'),c=await add('https://c.example');const move=api.move.bind(api);
    vi.spyOn(api,'move').mockImplementation(async(id,destination)=>{const before=(await api.get(id))[0]!;return move(id,{...destination,index:destination.index! - Number(before.parentId===destination.parentId && before.index!<destination.index!)});});
    vi.stubEnv('BROWSER','chrome');
    try {await repo.reorder([c,b,a],[a,b,c]);expect((await api.getChildren(repo.rootId!)).map(row=>row.id)).toEqual([c,folder,b,a]);}
    finally {vi.unstubAllEnvs();}
  });
  it('folder lifecycle and external removal choose a valid fallback', async () => {
    await setup(); await add(); await repo.createFolder('A'); await repo.createFolder('B'); const [a,b] = (await api.getChildren(repo.rootId!)).filter(node => !node.url);
    await repo.renameFolder(a!.id, 'New'); await repo.moveFolder(b!.id, a!.id); expect((await repo.load()).folders.map(node => node.title)).toEqual(['Speed Dial', 'B', 'New']);
    repo.activeId = a!.id; await api.move(a!.id, { parentId: 'other' }); expect((await repo.load()).activeId).toBe(repo.rootId);
    await repo.removeFolder(b!.id); await expect(repo.removeFolder(repo.rootId!)).rejects.toThrow();
    await api.removeTree(repo.rootId!); expect((await repo.load()).rootId).toBe('other'); expect((await api.getChildren('other')).length).toBe(1);
  });
  it('switching roots does not copy/delete data', async () => { await setup(); const id = await add(); const other = await api.create({ parentId: 'other', title: 'Second' }); await repo.selectRoot(other.id); expect((await repo.load()).tabs).toEqual([]); expect((await api.get(id))[0]?.url).toBe('https://example.com/'); });
  it('export/import includes empty folders and order; append is restricted and reports partial errors', async () => {
    await setup(); await add(); await repo.createFolder('Empty'); const data = await repo.exportData(); expect(data.entries).toEqual([{ title: 'Свой заголовок', url: 'https://example.com/' }, { title: 'Empty', children: [] }]);
    const outside = await api.create({ parentId: 'other', title: 'Outside', url: 'https://outside.example' }); await repo.importData(data); expect((await api.getChildren(repo.rootId!)).length).toBe(4); expect((await api.get(outside.id))[0]?.title).toBe('Outside');
    const original = api.create.bind(api); vi.spyOn(api, 'create').mockImplementationOnce(original).mockRejectedValueOnce(new Error('failed'));
    await expect(repo.importData(data)).rejects.toThrow('добавлено закладок 1, папок 0');
  });
  it('does not expose mass clear and preserves hidden descendants when selecting sources', async () => { await setup(); const id=await add(); await repo.createFolder('A'); const a=(await api.getChildren(repo.rootId!)).find(node=>!node.url)!; const deep=await api.create({parentId:a.id,title:'Deep'}); const before=await api.getTree(); await repo.selectRoot('other'); expect('clear' in repo).toBe(false); expect(await api.getTree()).toEqual(before); expect((await api.get(id))[0]).toBeTruthy(); expect((await api.get(deep.id))[0]).toBeTruthy(); });
});
