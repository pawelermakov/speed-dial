import type { MessageText } from '../../../common/i18n/contracts';
import type { Settings } from '../../settings';

export interface BackupBookmark {
  title: string;
  url: string;
  thumbnail?: Blob;
  favicon?: Blob;
  autoName?: true;
}
export interface BackupSelection {
  bookmarks: boolean;
  images: boolean;
  settings: boolean;
  background: boolean;
}
export const allBackupSections: BackupSelection = {
  bookmarks: true,
  images: true,
  settings: true,
  background: true,
};
export interface ImportData {
  bookmarks?: false;
  entries: Array<BackupBookmark | { title: string; children: BackupBookmark[] }>;
  settings?: Settings;
  background?: Blob | null;
}
export interface PreparedExport {
  data: ImportData;
  warnings: MessageText[];
}
export interface ImportReport {
  bookmarks: number;
  folders: number;
  images: number;
  settings?: true;
  background?: true;
  skipped?: number;
  warnings: MessageText[];
  error?: MessageText;
}
