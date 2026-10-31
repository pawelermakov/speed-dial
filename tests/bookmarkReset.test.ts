import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DialDatabase } from '../shared/infrastructure/database';
import { createDialFixture, type DialFixture } from './helpers/dialFixture';
import { MockBookmarks } from './helpers/bookmarksMock';
let db: DialDatabase, api: MockBookmarks, fixture: DialFixture;
beforeEach(async () => {
  db = new DialDatabase('names-' + crypto.randomUUID());
  api = new MockBookmarks();
  fixture = createDialFixture(db, { getValue: async () => null, setValue: async () => {} }, api, {
    getValue: async () => 'other',
    setValue: async () => {},
  });
  await fixture.snapshots.initialize();
});
afterEach(async () => {
  await db.delete();
});
it('rejects delayed images after moving or renaming and clears provenance on reset', async () => {
  const id = await fixture.bookmarks.actions.add({ url: 'example.com', title: '' });
  const expected = await fixture.bookmarks.source.bookmark(id);
  await api.update(id, { title: 'External' });
  await expect(
    fixture.bookmarks.actions.cache(
      id,
      expected.url!,
      'thumbnail',
      new Blob(['x'], { type: 'image/png' }),
      expected,
    ),
  ).rejects.toThrow('изменена');
  await fixture.backup.reset();
  expect(await fixture.bookmarks.actions.autoNameTicket(id)).toBeUndefined();
});
