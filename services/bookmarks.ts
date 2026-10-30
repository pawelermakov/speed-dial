import { t } from './i18n';
import type { BookmarkNode, FolderChoice } from '../modules/dial/modules/bookmarks';
export type { BookmarkNode, BookmarksPort, RootPort } from '../modules/dial/modules/bookmarks';
export function isBookmark(node: BookmarkNode): boolean {
  return !!node.url && node.type !== 'separator' && node.type !== 'folder';
}
export function isFolder(node: BookmarkNode): boolean {
  return !node.url && node.type !== 'separator' && node.type !== 'bookmark';
}
// System folders are valid sources, but their own nodes remain protected.
export function selectable(node: BookmarkNode): boolean {
  return isFolder(node) && !!node.parentId && !node.unmodifiable && node.folderType !== 'managed';
}
const systemLabels: Record<string, string> = {
  get 'bookmarks-bar'() {
    return t('folders.system.toolbar');
  },
  get other() {
    return t('folders.system.other');
  },
  get mobile() {
    return t('folders.system.mobile');
  },
};
export const firefoxTypes: Record<string, string> = {
  menu________: 'menu',
  toolbar_____: 'bookmarks-bar',
  unfiled_____: 'other',
  mobile______: 'mobile',
};
export function folderChoices(tree: BookmarkNode[]): FolderChoice[] {
  const result: FolderChoice[] = [];
  const roots = new Set(tree.map((node) => node.id));
  const stack = tree
    .slice()
    .reverse()
    .map((node) => ({ node, path: '', blocked: false }));
  while (stack.length) {
    const { node, path, blocked } = stack.pop()!;
    const managed = blocked || !!node.unmodifiable || node.folderType === 'managed';
    if (managed || !isFolder(node)) continue;
    const technical = roots.has(node.id);
    const standard = !technical && roots.has(node.parentId!);
    const firefoxType =
      standard && node.parentId === 'root________' ? firefoxTypes[node.id] : undefined;
    const folderType = node.folderType || firefoxType;
    const title = folderType
      ? (systemLabels[folderType] ??
        (folderType === 'menu' ? t('folders.system.menu') : node.title))
      : node.title;
    const location =
      standard && node.syncing !== undefined
        ? node.syncing
          ? t('folders.location.account')
          : t('folders.location.local')
        : '';
    const next = technical ? '' : [path, title + location].filter(Boolean).join(' / ');
    if (!technical && selectable(node))
      result.push({
        id: node.id,
        title,
        path: next,
        syncing: node.syncing,
        standard,
        folderType,
        writableChildren: true,
      });
    const children = node.children ?? [];
    for (let i = children.length - 1; i >= 0; i--)
      stack.push({ node: children[i]!, path: next, blocked: managed });
  }
  return result;
}
export function defaultFolderId(choices: FolderChoice[]): string | null {
  const others = choices.filter(
    (choice) => choice.folderType === 'other' && choice.writableChildren,
  );
  const account = others.filter((choice) => choice.syncing === true);
  return account.length === 1 ? account[0]!.id : others.length === 1 ? others[0]!.id : null;
}
// Display labels only: native folder names and IDs remain unchanged.
export function folderOptionLabels(
  choices: FolderChoice[],
): Array<FolderChoice & { label: string }> {
  const names = new Set(choices.map((row) => row.path)),
    used = new Set<string>();
  return choices.map((row) => {
    let label = row.path,
      index = 2;
    if (used.has(label)) {
      do {
        label = row.path + ' (' + index + ')';
        index++;
      } while (names.has(label) || used.has(label));
    }
    used.add(label);
    return { ...row, label };
  });
}
