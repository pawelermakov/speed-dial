import { selectable, type BookmarkNode } from './bookmarks';

export interface FolderLocator {
  version: 1;
  anchor: { folderType: 'bookmarks-bar' | 'other' | 'mobile'; syncing?: boolean };
  path: string[];
}
const types = ['bookmarks-bar', 'other', 'mobile'];
export function validLocator(value: unknown): value is FolderLocator {
  if (!value || typeof value !== 'object') return false;
  const v = value as FolderLocator;
  return v.version === 1 && !!v.anchor && types.includes(v.anchor.folderType) &&
    (v.anchor.syncing === undefined || typeof v.anchor.syncing === 'boolean') &&
    Array.isArray(v.path) && v.path.length <= 32 && v.path.every(p => typeof p === 'string' && p.length <= 512) &&
    Object.keys(v).every(k => ['version', 'anchor', 'path'].includes(k)) &&
    Object.keys(v.anchor).every(k => ['folderType', 'syncing'].includes(k)) &&
    new TextEncoder().encode(JSON.stringify(v)).length < 7500;
}
export function locateFolder(tree: BookmarkNode[], id: string): FolderLocator | null {
  function visit(nodes: BookmarkNode[], anchor?: FolderLocator['anchor'], path: string[] = []): FolderLocator | null {
    for (const node of nodes) {
      if (node.url || node.unmodifiable || node.folderType === 'managed') continue;
      const system = types.includes(node.folderType ?? '');
      const nextAnchor = system ? { folderType: node.folderType as FolderLocator['anchor']['folderType'], ...(typeof node.syncing === 'boolean' ? { syncing: node.syncing } : {}) } : anchor;
      const nextPath = system ? [] : anchor ? [...path, node.title] : [];
      if (node.id === id && selectable(node) && nextAnchor) {
        const locator: FolderLocator = { version: 1, anchor: nextAnchor, path: nextPath };
        return validLocator(locator) ? locator : null;
      }
      const found = visit(node.children ?? [], nextAnchor, nextPath);
      if (found) return found;
    }
    return null;
  }
  return visit(tree);
}
export function resolveFolder(tree: BookmarkNode[], locator: FolderLocator): string | null {
  // A local folder on another machine cannot be identified by its title. Old
  // Chrome trees without storage identity are deliberately not guessed either.
  if (!validLocator(locator) || locator.anchor.syncing !== true) return null;
  const anchors: BookmarkNode[] = [];
  function collect(nodes: BookmarkNode[]) {
    for (const node of nodes) {
      if (node.url || node.unmodifiable || node.folderType === 'managed') continue;
      if (node.folderType === locator.anchor.folderType && node.syncing === true) anchors.push(node);
      collect(node.children ?? []);
    }
  }
  collect(tree);
  if (anchors.length !== 1) return null;
  let node = anchors[0]!;
  for (const title of locator.path) {
    const matches = (node.children ?? []).filter(n => selectable(n) && n.title === title && n.syncing !== false);
    if (matches.length !== 1) return null;
    node = matches[0]!;
  }
  return selectable(node) ? node.id : null;
}
