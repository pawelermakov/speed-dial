import type { Settings, ISettingsService } from '../../settings';
import type { IAppearanceService } from '../../appearance';
import type { BookmarksDataPort, BookmarkNode } from '../../bookmarks';
import type { MessageText } from '../../../common/i18n/contracts';
import type { BackupSelection, ImportData, ImportReport } from '../entities/models';

export interface BackupPorts {
  source: {
    readonly rootId: string | null;
    rootNode(): Promise<BookmarkNode>;
    folder(id: string): Promise<BookmarkNode>;
    node(id: string): Promise<BookmarkNode>;
  };
  cache(
    id: string,
    url: string,
    resource: 'favicon' | 'thumbnail',
    blob: Blob,
    expected?: { title: string; parentId?: string },
  ): Promise<void>;
  data: BookmarksDataPort;
  settings: Pick<ISettingsService, 'getValue' | 'saveSettings'>;
  appearance: Pick<IAppearanceService, 'readStored' | 'save'>;
  validate(input: unknown): Settings;
  error(message: MessageText): Error;
  errorText(error: unknown): MessageText;
}

export interface IBackupService {
  reset(): Promise<void>;
  exportData(
    warning?: (message: MessageText) => void,
    selection?: BackupSelection,
  ): Promise<ImportData>;
  importData(
    data: ImportData,
    destination: string,
    expectedSettings?: Settings,
    selection?: BackupSelection,
  ): Promise<ImportReport>;
}
