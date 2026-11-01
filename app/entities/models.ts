import type { MessageText } from '../common/i18n/contracts';
import type { Bookmark, Folder } from '../modules/bookmarks';
import type { Settings } from '../modules/settings';

export interface Snapshot {
  tabs: Bookmark[];
  folders: Folder[];
  rootId: string | null;
  activeId: string | null;
  settings: Settings;
  background: Blob | null;
  rootNotice?: MessageText;
}
