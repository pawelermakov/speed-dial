import type { FolderChoice } from '../types/models';
export interface BookmarkNode { type?: 'bookmark' | 'folder' | 'separator'; id: string; parentId?: string; title: string; url?: string; index?: number; children?: BookmarkNode[]; unmodifiable?: string; folderType?: string; syncing?: boolean }
export interface BookmarksPort {
  get(id: string): Promise<BookmarkNode[]>;
  getTree(): Promise<BookmarkNode[]>;
  getSubTree(id: string): Promise<BookmarkNode[]>;
  getChildren(id: string): Promise<BookmarkNode[]>;
  create(value: { parentId: string; title: string; url?: string }): Promise<BookmarkNode>;
  update(id: string, value: { title?: string; url?: string }): Promise<BookmarkNode>;
  move(id: string, value: { parentId?: string; index?: number }): Promise<BookmarkNode>;
  remove(id: string): Promise<void>;
  removeTree(id: string): Promise<void>;
}
export interface RootPort { getValue(): Promise<string | null>; setValue(value: string): Promise<void> }
export function isBookmark(node: BookmarkNode): boolean { return !!node.url && node.type !== 'separator' && node.type !== 'folder'; }
export function isFolder(node: BookmarkNode): boolean { return !node.url && node.type !== 'separator' && node.type !== 'bookmark'; }
// System folders are valid sources, but their own nodes remain protected.
export function selectable(node: BookmarkNode): boolean {
  return isFolder(node) && !!node.parentId && !node.unmodifiable && node.folderType !== 'managed';
}
const systemLabels: Record<string, string> = {
  'bookmarks-bar': 'Панель закладок', other: 'Другие закладки', mobile: 'Мобильные закладки',
};
export const firefoxTypes: Record<string, string> = {
  menu________: 'menu', toolbar_____: 'bookmarks-bar', unfiled_____: 'other', mobile______: 'mobile',
};
export function folderChoices(tree: BookmarkNode[]): FolderChoice[] {
  const result: FolderChoice[] = [];
  const roots = new Set(tree.map(node => node.id));
  const stack = tree.slice().reverse().map(node => ({ node, path: '', blocked: false }));
  while (stack.length) {
    const { node, path, blocked } = stack.pop()!;
    const managed = blocked || !!node.unmodifiable || node.folderType === 'managed';
    if (managed || !isFolder(node)) continue;
    const technical = roots.has(node.id);
    const standard = !technical && roots.has(node.parentId!);
    const firefoxType = standard && node.parentId === 'root________' ? firefoxTypes[node.id] : undefined;
    const folderType = node.folderType || firefoxType;
    const title = folderType ? systemLabels[folderType] ?? (folderType === 'menu' ? 'Меню закладок' : node.title) : node.title;
    const location = standard && node.syncing !== undefined ? node.syncing ? ' (аккаунт)' : ' (локально)' : '';
    const next = technical ? '' : [path, title + location].filter(Boolean).join(' / ');
    if (!technical && selectable(node)) result.push({ id:node.id, title, path:next, syncing:node.syncing, standard, folderType, writableChildren:true });
    const children = node.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) stack.push({ node:children[i]!, path:next, blocked:managed });
  }
  return result;
}
export function defaultFolderId(choices: FolderChoice[]): string | null {
  const others = choices.filter(choice => choice.folderType === 'other' && choice.writableChildren);
  const account = others.filter(choice => choice.syncing === true);
  return account.length === 1 ? account[0]!.id : others.length === 1 ? others[0]!.id : null;
}