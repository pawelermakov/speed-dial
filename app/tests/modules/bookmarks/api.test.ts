import { expect, it, vi } from 'vitest';
import { BookmarksApi } from '../../../modules/bookmarks/adapters/api';
import { MockBookmarks } from '../../helpers/bookmarksMock';

it('isolates native trees while preserving browser folder capabilities', async () => {
  const tree = [
    {
      id: 'root',
      title: 'Root',
      dateAdded: 123,
      children: [
        {
          id: 'managed',
          parentId: 'root',
          title: 'Managed',
          unmodifiable: 'managed',
          folderType: 'bookmarks-bar',
          syncing: false,
          children: [],
        },
      ],
    },
  ];
  const native = new MockBookmarks();
  native.getTree = vi.fn(async function (this: MockBookmarks) {
    expect(this).toBe(native);
    return tree;
  });
  const api = new BookmarksApi(native);
  const result = await api.getTree();
  expect(result[0]).not.toHaveProperty('dateAdded');
  expect(result[0]!.children![0]).toMatchObject({
    unmodifiable: 'managed',
    folderType: 'bookmarks-bar',
    syncing: false,
  });
  result[0]!.children![0]!.title = 'Changed';
  result[0]!.children!.pop();
  expect((await api.getTree())[0]!.children![0]!.title).toBe('Managed');
});
