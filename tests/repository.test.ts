import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialDatabase } from '../services/database';
import { Repository } from '../services/repository';
import { MockBookmarks } from './bookmarksMock';
import type { SettingsEnvelope } from '../services/settings';
import { defaults } from '../types/models';
let db: DialDatabase, api: MockBookmarks, repo: Repository, stored: SettingsEnvelope | null, rootId: string | null;
beforeEach(() => {
  db = new DialDatabase('test-' + crypto.randomUUID()); api = new MockBookmarks(); stored = null; rootId = null;
  repo = new Repository(db, { getValue: async () => stored, setValue: async value => { stored = value; } }, api, { getValue: async () => rootId, setValue: async id => { rootId = id; } });
});
afterEach(async () => { await db.delete(); });
async function setup() { await repo.createRoot('other'); }
const add = (url = 'https://example.com/') => repo.add({ url, title: 'Свой заголовок' });
describe('browser bookmarks source', () => {
  it('unavailable or corrupt image cache never hides browser bookmarks', async () => { await setup(); const id = await add(); await db.tileAssets.put({bookmarkId:id,url:'https://example.com/',thumbnail:new Blob(['<svg/>'],{type:'image/svg+xml'})}); expect((await repo.load()).tabs[0]?.thumbnail).toBeNull(); vi.spyOn(db.tileAssets,'get').mockRejectedValue(new Error('IDB unavailable')); expect((await repo.load()).tabs[0]?.id).toBe(id); });
  it('offers setup without silently creating; creation is idempotent', async () => { expect((await repo.initialize()).rootId).toBeNull(); await setup(); await expect(repo.createRoot('other')).rejects.toThrow('уже существует'); expect((await api.getChildren('other')).length).toBe(1); });
  it('finds a unique folder after installation and stale IDs', async () => { const node = await api.create({ parentId: 'other', title: 'Speed Dial' }); rootId = 'stale'; expect((await repo.initialize()).rootId).toBe(node.id); });
  it('does not merge duplicate names or local/account branches', async () => { await api.create({ parentId: 'other', title: 'Speed Dial' }); await api.create({ parentId: 'other', title: 'Speed Dial' }); expect((await repo.initialize()).rootId).toBeNull(); });
  it('distinguishes account/local branches without relying on fixed IDs', async () => { const local=await api.create({parentId:'root',title:'Local'});Object.assign(api.nodes.get(local.id)!,{folderType:'other',syncing:false});await api.create({parentId:'other',title:'Speed Dial'});await api.create({parentId:local.id,title:'Speed Dial'});const choices=await repo.choices();expect(choices.find(node=>node.id==='other')?.path).toContain('аккаунт');expect(choices.find(node=>node.id===local.id)?.path).toContain('локально');expect((await repo.initialize()).rootId).toBeNull(); });
  it('protects technical, standard and managed folders', async () => { for (const id of ['root', 'other']) await expect(repo.selectRoot(id)).rejects.toThrow(); const managed = await api.create({ parentId: 'other', title: 'Managed' }); api.nodes.get(managed.id)!.unmodifiable = 'managed'; const nested = await api.create({ parentId: managed.id, title: 'Nested' }); await expect(repo.selectRoot(nested.id)).rejects.toThrow(); });
  it('rejects unavailable API instead of presenting an empty source', async () => { vi.spyOn(api, 'getTree').mockRejectedValue(new Error('Permission denied')); await expect(repo.initialize()).rejects.toThrow('Permission'); });
  it('shows direct bookmarks without categories and with empty cache', async () => { await setup(); const id = await add(); await db.tileAssets.clear(); const state = await repo.load(); expect(state.categories).toEqual([]); expect(state.tabs[0]).toMatchObject({ id, thumbnail: null, favicon: null }); });
  it('handles mixed, only-folder, empty and deep structures', async () => {
    await setup(); expect((await repo.load()).tabs).toEqual([]);
    const direct = await add(); await repo.createCategory('Главная'); const category = (await api.getChildren(repo.rootId!)).find(node => !node.url)!;
    const deep = await api.create({ parentId: category.id, title: 'Deep' }); await api.create({ parentId: deep.id, title: 'Hidden', url: 'https://hidden.example' });
    const state = await repo.load(); expect(state.categories.map(node => node.title)).toEqual(['Главная', 'Главная (папка)']); expect(state.tabs.map(node => node.id)).toEqual([direct]);
    repo.activeId = category.id; expect((await repo.load()).tabs).toEqual([]);
    await api.remove(direct); expect((await repo.load()).categories.length).toBe(1); expect((await api.getChildren(deep.id)).length).toBe(1);
  });
  it('CRUD, moves, cache and reset preserve browser source and custom titles', async () => {
    await setup(); const id = await add(); const image = new Blob(['image'], { type: 'image/png' }); await repo.cache(id, 'https://example.com/', 'thumbnail', image);
    await repo.edit(id, 'https://example.com/', 'Edited'); expect((await repo.load()).tabs[0]?.thumbnail).toBeTruthy();
    await repo.createCategory('Work'); const category = (await api.getChildren(repo.rootId!)).find(node => !node.url)!;
    await repo.edit(id, 'https://example.com/', 'Edited', category.id); repo.activeId = category.id;
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
  it('category lifecycle and external removal choose a valid fallback', async () => {
    await setup(); await add(); await repo.createCategory('A'); await repo.createCategory('B'); const [a,b] = (await api.getChildren(repo.rootId!)).filter(node => !node.url);
    await repo.renameCategory(a!.id, 'New'); await repo.moveCategory(b!.id, a!.id); expect((await repo.load()).categories.map(node => node.title)).toEqual(['Главная', 'B', 'New']);
    repo.activeId = a!.id; await api.move(a!.id, { parentId: 'other' }); expect((await repo.load()).activeId).toBe(repo.rootId);
    await repo.removeCategory(b!.id); await expect(repo.removeCategory(repo.rootId!)).rejects.toThrow();
    await api.removeTree(repo.rootId!); expect((await repo.load()).rootId).toBeNull(); expect((await api.getChildren('other')).length).toBe(1);
  });
  it('switching roots does not copy/delete data', async () => { await setup(); const id = await add(); const other = await api.create({ parentId: 'other', title: 'Second' }); await repo.selectRoot(other.id); expect((await repo.load()).tabs).toEqual([]); expect((await api.get(id))[0]?.url).toBe('https://example.com/'); });
  it('export/import includes empty categories and order; append is restricted and reports partial errors', async () => {
    await setup(); await add(); await repo.createCategory('Empty'); const data = await repo.exportData(); expect(data.entries).toEqual([{ title: 'Свой заголовок', url: 'https://example.com/' }, { title: 'Empty', children: [] }]);
    const outside = await api.create({ parentId: 'other', title: 'Outside', url: 'https://outside.example' }); await repo.importData(data); expect((await api.getChildren(repo.rootId!)).length).toBe(4); expect((await api.get(outside.id))[0]?.title).toBe('Outside');
    const original = api.create.bind(api); vi.spyOn(api, 'create').mockImplementationOnce(original).mockRejectedValueOnce(new Error('failed'));
    await expect(repo.importData(data)).rejects.toThrow('добавлено закладок 1, папок 0');
  });
  it('blocks mass clear with deep folders and keeps other roots', async () => { await setup(); const id = await add(); await repo.createCategory('A'); const a = (await api.getChildren(repo.rootId!)).find(node => !node.url)!; const deep = await api.create({ parentId: a.id, title: 'Deep' }); await expect(repo.clear()).rejects.toThrow('вложенные'); expect((await api.get(id))[0]).toBeTruthy(); await api.remove(deep.id); await repo.clear(); expect(await api.getChildren(repo.rootId!)).toEqual([]); expect((await api.get('other'))[0]).toBeTruthy(); });
});
