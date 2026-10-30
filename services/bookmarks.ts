// Compatibility helpers until callers migrate; no duplicate tree implementation.
import { t } from './i18n';
import { folderChoices as choices } from '../modules/dial/modules/bookmarks/helpers/folders';
import type { BookmarkNode } from '../modules/dial/modules/bookmarks';
export type { BookmarkNode, BookmarksPort, RootPort } from '../modules/dial/modules/bookmarks';
export {
  isBookmark,
  isFolder,
  selectable,
  firefoxTypes,
  defaultFolderId,
  folderOptionLabels,
} from '../modules/dial/modules/bookmarks/helpers/folders';
export function folderChoices(tree: BookmarkNode[]) {
  return choices(tree, t);
}
