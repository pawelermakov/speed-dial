import { describe, expect, it } from 'vitest';
import {
  folderChoices,
  folderOptionLabels,
  defaultFolderId,
  type BookmarkNode,
} from '../services/bookmarks';

describe('bookmark source folders', () => {
  it('excludes Firefox separators from folder choices', () => {
    expect(
      folderChoices([
        {
          id: 'root',
          title: '',
          children: [
            { id: 'separator', parentId: 'root', title: '', type: 'separator' },
            { id: 'folder', parentId: 'root', title: 'Folder', type: 'folder' },
          ],
        },
      ]).map((row) => row.id),
    ).toEqual(['folder']);
  });
  it('uses types and account metadata, never titles or fixed Chrome IDs', () => {
    const tree = [
      {
        id: 'technical',
        title: '',
        children: [
          {
            id: 'local-other',
            parentId: 'technical',
            title: 'Other',
            folderType: 'other',
            syncing: false,
          },
          {
            id: 'account-other',
            parentId: 'technical',
            title: 'Andere',
            folderType: 'other',
            syncing: true,
          },
          { id: 'fake', parentId: 'technical', title: 'Other bookmarks' },
        ],
      },
    ];
    expect(defaultFolderId(folderChoices(tree))).toBe('account-other');
    tree[0]!.children[1]!.syncing = false;
    expect(defaultFolderId(folderChoices(tree))).toBeNull();
    expect(
      defaultFolderId(
        folderChoices([
          { id: '0', title: '', children: [{ id: '2', parentId: '0', title: 'Other bookmarks' }] },
        ]),
      ),
    ).toBeNull();
  });
  it('recognizes Firefox unfiled only in the Firefox root structure', () => {
    const tree = [
      {
        id: 'root________',
        title: '',
        children: [
          { id: 'toolbar_____', parentId: 'root________', title: 'Bookmarks Toolbar' },
          { id: 'unfiled_____', parentId: 'root________', title: 'Other Bookmarks' },
        ],
      },
    ];
    expect(defaultFolderId(folderChoices(tree))).toBe('unfiled_____');
    expect(folderChoices(tree).map((row) => row.path)).toEqual([
      'Панель закладок',
      'Другие закладки',
    ]);
    expect(
      defaultFolderId(
        folderChoices([
          { id: '0', title: '', children: [{ id: 'unfiled_____', parentId: '0', title: 'Other' }] },
        ]),
      ),
    ).toBeNull();
  });
  it('keeps natural order, full paths and distinct IDs, excluding protected branches', () => {
    const tree = [
      {
        id: 'root',
        title: '',
        children: [
          {
            id: 'a',
            parentId: 'root',
            title: 'Other',
            folderType: 'other',
            syncing: true,
            children: [
              {
                id: 'work-a',
                parentId: 'a',
                title: 'Работа',
                children: [{ id: 'deep', parentId: 'work-a', title: 'Проекты' }],
              },
              { id: 'url', parentId: 'a', title: 'Link', url: 'https://example.com' },
              {
                id: 'managed',
                parentId: 'a',
                title: 'Managed',
                unmodifiable: 'managed',
                children: [{ id: 'blocked', parentId: 'managed', title: 'Hidden' }],
              },
            ],
          },
          {
            id: 'b',
            parentId: 'root',
            title: 'Other',
            folderType: 'other',
            syncing: false,
            children: [{ id: 'work-b', parentId: 'b', title: 'Работа' }],
          },
        ],
      },
    ];
    const choices = folderChoices(tree);
    expect(choices.map((row) => row.id)).toEqual(['a', 'work-a', 'deep', 'b', 'work-b']);
    expect(choices[2]!.path).toBe('Другие закладки (аккаунт) / Работа / Проекты');
    expect(choices[4]!.path).toBe('Другие закладки (локально) / Работа');
  });
  it('walks thousands of nested folders without recursion', () => {
    const root: BookmarkNode = { id: 'root', title: '', children: [] };
    let parent = root;
    for (let i = 0; i < 2000; i++) {
      const node: BookmarkNode = {
        id: String(i),
        parentId: parent.id,
        title: 'F' + i,
        children: [],
      };
      parent.children!.push(node);
      parent = node;
    }
    const choices = folderChoices([root]);
    expect(choices).toHaveLength(2000);
    expect(choices.at(-1)!.path).toContain('F1998 / F1999');
  });
});

it('keeps duplicate folder labels unique even when native names already contain numbered suffixes', () => {
  const paths = ['Root / Work', 'Root / Work', 'Root / Work', 'Root / Work (2)', 'Root / Work (3)'];
  const choices = paths.map((path, index) => ({
    id: String(index),
    title: path,
    path,
    standard: false,
    writableChildren: true,
  }));
  expect(folderOptionLabels(choices).map((row) => row.label)).toEqual([
    'Root / Work',
    'Root / Work (4)',
    'Root / Work (5)',
    'Root / Work (2)',
    'Root / Work (3)',
  ]);
  expect(folderOptionLabels(choices).map((row) => row.id)).toEqual(choices.map((row) => row.id));
  expect(choices.map((row) => row.path)).toEqual(paths);
  expect(
    folderOptionLabels([choices[0]!, { ...choices[0]!, id: 'other' }]).map((row) => row.label),
  ).toEqual(['Root / Work', 'Root / Work (2)']);
});
