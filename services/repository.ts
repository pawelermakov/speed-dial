import { t, LocalizedError, errorMessage } from './i18n';
import type { BackupService } from '../modules/dial/modules/backup';
import { createLazyLoader } from '../shared/helpers/lazy';
import type { DialDatabase } from './database';
import {
  createSettingsService,
  type SettingsService,
  type SettingsPort,
} from '../modules/dial/modules/settings';
import {
  createAppearanceService,
  type AppearanceService,
} from '../modules/dial/modules/appearance';
import { createBackgroundStorage } from '../modules/dial/modules/appearance/adapters/storage';
import {
  createBookmarksModule,
  type BookmarksModule,
  type AssetsPort,
  type AutoNamesPort,
  type BookmarksPort,
  type RootPort,
} from '../modules/dial/modules/bookmarks';
import { defaults, type Snapshot } from '../types/models';
import { normalizeUrl, validateSettings } from './validation';
import { withDataLock } from '../shared/infrastructure/browser/dataLock';
export { withDataLock } from '../shared/infrastructure/browser/dataLock';
export class Repository {
  private backup = createLazyLoader(async () => {
    const { createBackupService } = await import('../modules/dial/modules/backup/services/backup');
    return createBackupService({
      source: this,
      bookmarks: this.bookmarks,
      assets: this.images,
      metadata: this.metadata,
      settings: this.settings,
      preferences: this.settingsService,
      appearance: this.appearance,
      validate: validateSettings,
      error: (message) => new LocalizedError(message),
      errorText: errorMessage,
    });
  });
  private module: BookmarksModule;
  private settingsService: SettingsService;
  private appearance: AppearanceService;
  private images: AssetsPort;
  private metadata: AutoNamesPort;
  constructor(
    db: DialDatabase,
    private settings: SettingsPort,
    readonly bookmarks: BookmarksPort,
    root: RootPort,
    module?: BookmarksModule,
    preferences?: { settings: SettingsService; appearance: AppearanceService },
  ) {
    // Compatibility assembly for legacy constructors; production passes the module from its root.
    this.module =
      module ??
      createBookmarksModule({
        database: db,
        bookmarks,
        root,
        lock: withDataLock,
        normalizeUrl,
        presentation: { translate: t, error: (message) => new LocalizedError(message) },
      });
    this.appearance =
      preferences?.appearance ?? createAppearanceService(createBackgroundStorage(db));
    this.settingsService =
      preferences?.settings ??
      createSettingsService({
        storage: settings,
        background: this.appearance,
        source: this.module.source,
        validate: validateSettings,
        error: (message) => new LocalizedError(message),
        errorText: errorMessage,
      });
    this.images = this.module.assets;
    this.metadata = this.module.autoNames;
  }
  get rootId() {
    return this.module.source.rootId;
  }
  set rootId(value: string | null) {
    this.module.source.rootId = value;
  }
  get activeId() {
    return this.module.source.activeId;
  }
  set activeId(value: string | null) {
    this.module.source.activeId = value;
  }
  clearSourceNotice(...args: Parameters<BookmarksModule['source']['clearSourceNotice']>) {
    return this.module.source.clearSourceNotice(...args);
  }
  selectFolder(...args: Parameters<BookmarksModule['source']['selectFolder']>) {
    return this.module.source.selectFolder(...args);
  }
  choices(...args: Parameters<BookmarksModule['source']['choices']>) {
    return this.module.source.choices(...args);
  }
  node(...args: Parameters<BookmarksModule['source']['node']>) {
    return this.module.source.node(...args);
  }
  folder(...args: Parameters<BookmarksModule['source']['folder']>) {
    return this.module.source.folder(...args);
  }
  adoptRoot(...args: Parameters<BookmarksModule['source']['adoptRoot']>) {
    return this.module.source.adoptRoot(...args);
  }
  selectRoot(...args: Parameters<BookmarksModule['source']['selectRoot']>) {
    return this.module.source.selectRoot(...args);
  }
  rootNode(...args: Parameters<BookmarksModule['source']['rootNode']>) {
    return this.module.source.rootNode(...args);
  }
  parent(...args: Parameters<BookmarksModule['source']['parent']>) {
    return this.module.source.parent(...args);
  }
  bookmark(...args: Parameters<BookmarksModule['source']['bookmark']>) {
    return this.module.source.bookmark(...args);
  }
  search(...args: Parameters<BookmarksModule['source']['search']>) {
    return this.module.source.search(...args);
  }

  add(...args: Parameters<BookmarksModule['actions']['add']>) {
    return this.module.actions.add(...args);
  }
  edit(...args: Parameters<BookmarksModule['actions']['edit']>) {
    return this.module.actions.edit(...args);
  }
  autoNameTicket(...args: Parameters<BookmarksModule['actions']['autoNameTicket']>) {
    return this.module.actions.autoNameTicket(...args);
  }
  applyCapturedTitle(...args: Parameters<BookmarksModule['actions']['applyCapturedTitle']>) {
    return this.module.actions.applyCapturedTitle(...args);
  }
  cache(...args: Parameters<BookmarksModule['actions']['cache']>) {
    return this.module.actions.cache(...args);
  }
  remove(...args: Parameters<BookmarksModule['actions']['remove']>) {
    return this.module.actions.remove(...args);
  }
  reorder(...args: Parameters<BookmarksModule['actions']['reorder']>) {
    return this.module.actions.reorder(...args);
  }
  reorderFolders(...args: Parameters<BookmarksModule['actions']['reorderFolders']>) {
    return this.module.actions.reorderFolders(...args);
  }
  createFolder(...args: Parameters<BookmarksModule['actions']['createFolder']>) {
    return this.module.actions.createFolder(...args);
  }
  childFolder(...args: Parameters<BookmarksModule['actions']['childFolder']>) {
    return this.module.actions.childFolder(...args);
  }
  renameFolder(...args: Parameters<BookmarksModule['actions']['renameFolder']>) {
    return this.module.actions.renameFolder(...args);
  }
  removeFolder(...args: Parameters<BookmarksModule['actions']['removeFolder']>) {
    return this.module.actions.removeFolder(...args);
  }
  moveFolder(...args: Parameters<BookmarksModule['actions']['moveFolder']>) {
    return this.module.actions.moveFolder(...args);
  }

  async initialize() {
    await this.module.source.initialize();
    return this.load();
  }
  async load(includeBackground = true): Promise<Snapshot> {
    const complete = this.module.source.prepareRead();
    const [envelope, background, choices] = await Promise.all([
      this.settings.getValue(),
      includeBackground ? this.appearance.readStored() : undefined,
      this.choices(),
    ]);
    const view = await complete(choices);
    return {
      tabs: view.tabs,
      folders: view.folders,
      rootId: view.rootId,
      activeId: view.activeId,
      settings: envelope ? validateSettings(envelope.value) : { ...defaults },
      background: background?.blob ?? null,
      rootNotice: view.rootNotice,
    };
  }
  saveSettings(...args: Parameters<SettingsService['saveSettings']>) {
    return this.settingsService.saveSettings(...args);
  }
  patchSettings(...args: Parameters<SettingsService['patchSettings']>) {
    return this.settingsService.patchSettings(...args);
  }
  saveSearchProvider(...args: Parameters<SettingsService['saveSearchProvider']>) {
    return this.settingsService.saveSearchProvider(...args);
  }
  async reset() {
    return (await this.backup.get()).reset();
  }
  saveBackground(blob: Blob | null) {
    return this.appearance.save(blob);
  }
  async exportData(...args: Parameters<BackupService['exportData']>) {
    return (await this.backup.get()).exportData(...args);
  }
  async importData(...args: Parameters<BackupService['importData']>) {
    return (await this.backup.get()).importData(...args);
  }
  dispose() {
    this.backup.dispose();
  }
}
