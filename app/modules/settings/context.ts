import { createServiceContext } from '../../common/ui/serviceContext';
import type { FolderChoice } from '../bookmarks';
import type { ISettingsSyncService } from './services/interfaces';
export interface SettingsUiServices {
  source: { choices(): Promise<FolderChoice[]> };
  sync: ISettingsSyncService;
  events: { subscribe(listener: (assetsOnly: boolean) => void): () => void };
}
export const { provide: provideSettingsServices, use: useSettingsServices } =
  createServiceContext<SettingsUiServices>('settings');
