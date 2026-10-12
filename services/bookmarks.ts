export interface BookmarkNode { id: string; parentId?: string; title: string; url?: string; index?: number; children?: BookmarkNode[]; unmodifiable?: string; folderType?: string; syncing?: boolean }
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
export function selectable(node: BookmarkNode): boolean { return !node.url && !!node.parentId && !node.unmodifiable && !node.folderType; }
export function folderChoices(tree: BookmarkNode[]) {
  const result: Array<{ id: string; path: string; syncing?: boolean; standard: boolean; title: string }> = [];
  function visit(node: BookmarkNode, path: string, managed = false) {
    const blocked = managed || !!node.unmodifiable;
    const next = [path, node.title].filter(Boolean).join(' / ');
    if (!node.url && node.parentId && !blocked) result.push({ id: node.id, title: node.title, path: next + (node.syncing === undefined ? '' : node.syncing ? ' (аккаунт)' : ' (локально)'), syncing: node.syncing, standard: !!node.folderType || tree.some(root => root.id === node.parentId) });
    node.children?.forEach(child => visit(child, next, blocked));
  }
  tree.forEach(node => visit(node, ''));
  return result;
}
