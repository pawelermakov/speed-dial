import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DialDatabase } from '../../../../../shared/infrastructure/database';
import { MockBookmarks } from '../../../../../tests/helpers/bookmarksMock';
import { t } from '../../../../../tests/helpers/i18n';
import { LocalizedError } from '../../../../../shared/i18n/errors';
import { normalizeUrl } from '../../../../../services/validation';
import { withDataLock } from '../../../../../shared/infrastructure/browser/dataLock';
import { createBookmarksModule, type BookmarksModule } from '../createBookmarksModule';
let db: DialDatabase, api: MockBookmarks, module: BookmarksModule;
const create = () =>
  createBookmarksModule({
    database: db,
    bookmarks: api,
    root: { getValue: async () => 'other', setValue: async () => {} },
    lock: withDataLock,
    normalizeUrl,
    presentation: { translate: t, error: (message) => new LocalizedError(message) },
  });
beforeEach(async () => {
  db = new DialDatabase('names-' + crypto.randomUUID());
  api = new MockBookmarks();
  module = create();
  await module.source.initialize();
});
afterEach(async () => {
  await db.delete();
});
it('creates directly in the selected folder and rejects foreign/stale parents', async () => {
  const folder = await api.create({ parentId: 'other', title: 'Work' });
  const id = await module.actions.add({ url: 'example.com', title: '', parentId: folder.id });
  expect(await module.source.node(id)).toMatchObject({
    parentId: folder.id,
    title: 'example.com',
    url: 'https://example.com/',
  });
  await expect(
    module.actions.add({ url: 'example.com', title: '', parentId: 'missing' }),
  ).rejects.toThrow();
  expect(await module.actions.autoNameTicket(id)).toBeDefined();
});
it('applies a trustworthy captured title once and preserves explicit domain names and unmarked bookmark titles', async () => {
  for (const title of ['', 'example.com']) {
    const id = await module.actions.add({ url: 'example.com', title });
    const ticket = await module.actions.autoNameTicket(id);
    await module.actions.applyCapturedTitle(
      id,
      'https://example.com/',
      '  Example   Page  ',
      ticket,
    );
    expect((await module.source.node(id)).title).toBe(title || 'Example Page');
    await module.actions.applyCapturedTitle(id, 'https://example.com/', 'Later title', ticket);
    expect((await module.source.node(id)).title).toBe(title || 'Example Page');
  }
  const unmarked = await api.create({
    parentId: 'other',
    url: 'https://example.com/',
    title: 'example.com',
  });
  await module.actions.applyCapturedTitle(
    unmarked.id,
    unmarked.url!,
    'Example Page',
    await module.actions.autoNameTicket(unmarked.id),
  );
  expect((await module.source.node(unmarked.id)).title).toBe('example.com');
});
it('does not apply stale results after manual editing, URL change or deletion', async () => {
  const id = await module.actions.add({ url: 'example.com', title: '' });
  const ticket = await module.actions.autoNameTicket(id);
  await module.actions.edit(id, 'https://example.com/', 'example.com', undefined, true);
  await module.actions.applyCapturedTitle(id, 'https://example.com/', 'Page', ticket);
  expect((await module.source.node(id)).title).toBe('example.com');
  await module.actions.edit(id, 'https://new.example/', '', undefined, true);
  await module.actions.applyCapturedTitle(id, 'https://example.com/', 'Old Page', ticket);
  expect((await module.source.node(id)).title).toBe('new.example');
  const next = await module.actions.autoNameTicket(id);
  await module.actions.remove(id);
  await module.actions.applyCapturedTitle(id, 'https://new.example/', 'Deleted Page', next);
  expect(await module.actions.autoNameTicket(id)).toBeUndefined();
});
it('retargets a confirmed automatic domain on URL edits but preserves user names', async () => {
  const id = await module.actions.add({ url: 'example.com', title: '' });
  expect(
    await module.actions.edit(id, 'https://new.example/', 'example.com', undefined, false),
  ).toBe(true);
  expect((await module.source.node(id)).title).toBe('new.example');
  await module.actions.applyCapturedTitle(
    id,
    'https://new.example/',
    'New Page',
    await module.actions.autoNameTicket(id),
  );
  expect((await module.source.node(id)).title).toBe('New Page');
  expect(await module.actions.edit(id, 'https://new.example/', 'My name')).toBe(false);
  await module.actions.edit(id, 'https://third.example/', 'My name', undefined, false);
  expect((await module.source.node(id)).title).toBe('My name');
});
it('ignores unsuitable titles and external changes; persists provenance across module instances', async () => {
  const id = await module.actions.add({ url: 'example.com', title: '' });
  const peer = create();
  expect(await peer.actions.autoNameTicket(id)).toEqual(await module.actions.autoNameTicket(id));
  const ticket = await module.actions.autoNameTicket(id);
  for (const title of [
    '',
    'example.com',
    'https://example.com/',
    'Error loading page',
    'Just a moment...',
    'x'.repeat(4097),
  ]) {
    await module.actions.applyCapturedTitle(id, 'https://example.com/', title, ticket);
    expect((await module.source.node(id)).title).toBe('example.com');
  }
  await api.update(id, { title: 'External name' });
  await module.actions.applyCapturedTitle(id, 'https://example.com/', 'Page', ticket);
  expect((await module.source.node(id)).title).toBe('External name');
  await expect(
    module.actions.edit(id, 'https://new.example/', 'Changed', undefined, true, {
      url: 'https://example.com/',
      title: 'example.com',
      parentId: 'other',
    }),
  ).rejects.toThrowLocalized('другом окне');
});
it('consumes combined Chrome and split Firefox events without deleting our new fallback marker', async () => {
  for (const split of [false, true]) {
    const id = await module.actions.add({ url: 'old.example', title: '' });
    await module.actions.edit(id, 'https://new.example/', 'old.example', undefined, false);
    const ticket = await module.actions.autoNameTicket(id);
    if (split) {
      await module.autoNames.invalidate(id, { url: 'https://new.example/' });
      await module.autoNames.invalidate(id, { title: 'new.example' });
    } else
      await module.autoNames.invalidate(id, { url: 'https://new.example/', title: 'new.example' });
    expect((await module.actions.autoNameTicket(id))?.token).toBe(ticket?.token);
    await module.autoNames.invalidate(id, { title: 'new.example' });
    expect(await module.actions.autoNameTicket(id)).toBeUndefined();
  }
});
it('preserves pending automatic names and assets when only the folder changes', async () => {
  const id = await module.actions.add({ url: 'example.com', title: '' });
  const ticket = await module.actions.autoNameTicket(id);
  const folder = await api.create({ parentId: 'other', title: 'Work' });
  expect(
    await module.actions.edit(id, 'https://example.com/', 'example.com', folder.id, false),
  ).toBe(false);
  expect((await module.actions.autoNameTicket(id))?.token).toBe(ticket?.token);
  expect((await module.source.node(id)).parentId).toBe(folder.id);
});
