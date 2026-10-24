import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DialDatabase } from '../services/database';
import { Repository } from '../services/repository';
import { MockBookmarks } from './bookmarksMock';
let db: DialDatabase, api: MockBookmarks, repo: Repository;
beforeEach(async () => {
 db = new DialDatabase('names-' + crypto.randomUUID()); api = new MockBookmarks();
 repo = new Repository(db, { getValue: async () => null, setValue: async () => {} }, api, { getValue: async () => 'other', setValue: async () => {} });
 await repo.initialize();
});
afterEach(async () => { await db.delete(); });
it('creates directly in the selected folder and rejects foreign/stale parents', async () => {
 const folder = await api.create({parentId:'other',title:'Work'});
 const id = await repo.add({url:'example.com',title:'',parentId:folder.id});
 expect(await repo.node(id)).toMatchObject({parentId:folder.id,title:'example.com',url:'https://example.com/'});
 await expect(repo.add({url:'example.com',title:'',parentId:'missing'})).rejects.toThrow();
 expect(await repo.autoNameTicket(id)).toBeDefined();
});
it('applies a trustworthy captured title once and preserves explicit domain names and unknown old names', async () => {
 for (const title of ['', 'example.com']) {
  const id = await repo.add({url:'example.com',title});
  const ticket = await repo.autoNameTicket(id);
  await repo.applyCapturedTitle(id,'https://example.com/','  Example   Page  ',ticket);
  expect((await repo.node(id)).title).toBe(title || 'Example Page');
  await repo.applyCapturedTitle(id,'https://example.com/','Later title',ticket);
  expect((await repo.node(id)).title).toBe(title || 'Example Page');
 }
 const old = await api.create({parentId:'other',url:'https://example.com/',title:'example.com'});
 await repo.applyCapturedTitle(old.id,old.url!,'Example Page',await repo.autoNameTicket(old.id));
 expect((await repo.node(old.id)).title).toBe('example.com');
});
it('does not apply stale results after manual editing, URL change or deletion', async () => {
 const id = await repo.add({url:'example.com',title:''}); const ticket = await repo.autoNameTicket(id);
 await repo.edit(id,'https://example.com/','example.com',undefined,true);
 await repo.applyCapturedTitle(id,'https://example.com/','Page',ticket);
 expect((await repo.node(id)).title).toBe('example.com');
 await repo.edit(id,'https://new.example/','',undefined,true);
 await repo.applyCapturedTitle(id,'https://example.com/','Old Page',ticket);
 expect((await repo.node(id)).title).toBe('new.example');
 const next = await repo.autoNameTicket(id); await repo.remove(id);
 await repo.applyCapturedTitle(id,'https://new.example/','Deleted Page',next);
 expect(await repo.autoNameTicket(id)).toBeUndefined();
});
it('retargets a confirmed automatic domain on URL edits but preserves user names', async () => {
 const id = await repo.add({url:'example.com',title:''});
 expect(await repo.edit(id,'https://new.example/','example.com',undefined,false)).toBe(true);
 expect((await repo.node(id)).title).toBe('new.example');
 await repo.applyCapturedTitle(id,'https://new.example/','New Page',await repo.autoNameTicket(id));
 expect((await repo.node(id)).title).toBe('New Page');
 expect(await repo.edit(id,'https://new.example/','My name')).toBe(false);
 await repo.edit(id,'https://third.example/','My name',undefined,false);
 expect((await repo.node(id)).title).toBe('My name');
});
it('ignores unsuitable titles and external changes; persists provenance across repository instances', async () => {
 const id = await repo.add({url:'example.com',title:''});
 const peer = new Repository(db,{} as never,api,{} as never);
 expect(await peer.autoNameTicket(id)).toEqual(await repo.autoNameTicket(id));
 const ticket = await repo.autoNameTicket(id);
 for (const title of ['', 'example.com', 'https://example.com/', 'Error loading page', 'Just a moment...', 'x'.repeat(4097)]) {
  await repo.applyCapturedTitle(id,'https://example.com/',title,ticket);
  expect((await repo.node(id)).title).toBe('example.com');
 }
 await api.update(id,{title:'External name'});
 await repo.applyCapturedTitle(id,'https://example.com/','Page',ticket);
 expect((await repo.node(id)).title).toBe('External name');
 await expect(repo.edit(id,'https://new.example/','Changed',undefined,true,{url:'https://example.com/',title:'example.com',parentId:'other'})).rejects.toThrow('другом окне');
});
it('rejects delayed images after moving or renaming and clears provenance on reset', async () => {
 const id = await repo.add({url:'example.com',title:''}); const expected = await repo.bookmark(id);
 await api.update(id,{title:'External'});
 await expect(repo.cache(id,expected.url!,'thumbnail',new Blob(['x'],{type:'image/png'}),expected)).rejects.toThrow('изменена');
 await repo.reset(); expect(await repo.autoNameTicket(id)).toBeUndefined();
});
import { invalidateAutoName } from '../services/autoNames';
it('consumes combined Chrome and split Firefox events without deleting our new fallback marker', async () => {
 for (const split of [false,true]) {
  const id = await repo.add({url:'old.example',title:''});
  await repo.edit(id,'https://new.example/','old.example',undefined,false);
  const ticket=await repo.autoNameTicket(id);
  if(split){await invalidateAutoName(db,id,{url:'https://new.example/'});await invalidateAutoName(db,id,{title:'new.example'});}
  else await invalidateAutoName(db,id,{url:'https://new.example/',title:'new.example'});
  expect((await repo.autoNameTicket(id))?.token).toBe(ticket?.token);
  await invalidateAutoName(db,id,{title:'new.example'});
  expect(await repo.autoNameTicket(id)).toBeUndefined();
 }
});
it('preserves pending automatic names and assets when only the folder changes', async () => {
 const id=await repo.add({url:'example.com',title:''});const ticket=await repo.autoNameTicket(id);
 const folder=await api.create({parentId:'other',title:'Work'});
 expect(await repo.edit(id,'https://example.com/','example.com',folder.id,false)).toBe(false);
 expect((await repo.autoNameTicket(id))?.token).toBe(ticket?.token);
 expect((await repo.node(id)).parentId).toBe(folder.id);
});
