import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DialDatabase } from '../services/database';
import { Repository } from '../services/repository';
import { MockBookmarks } from './helpers/bookmarksMock';
let db: DialDatabase, api: MockBookmarks, repo: Repository;
beforeEach(async () => {
  db = new DialDatabase('names-' + crypto.randomUUID());
  api = new MockBookmarks();
  repo = new Repository(db, { getValue: async () => null, setValue: async () => {} }, api, {
    getValue: async () => 'other',
    setValue: async () => {},
  });
  await repo.initialize();
});
afterEach(async () => {
  await db.delete();
});
it('rejects delayed images after moving or renaming and clears provenance on reset', async () => {
  const id = await repo.add({ url: 'example.com', title: '' });
  const expected = await repo.bookmark(id);
  await api.update(id, { title: 'External' });
  await expect(
    repo.cache(id, expected.url!, 'thumbnail', new Blob(['x'], { type: 'image/png' }), expected),
  ).rejects.toThrow('изменена');
  await repo.reset();
  expect(await repo.autoNameTicket(id)).toBeUndefined();
});
