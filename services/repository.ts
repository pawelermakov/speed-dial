import { t, message, LocalizedError, errorMessage, joinMessages, type MessageText } from './i18n';
import type { DialDatabase } from './database';
import type { SettingsPort } from '../modules/dial/modules/settings';
import {
  createBookmarksModule,
  type BookmarksModule,
  type AssetsPort,
  type AutoNamesPort,
  type BookmarksPort,
  type RootPort,
  type BookmarkNode,
} from '../modules/dial/modules/bookmarks';
import {
  allBackupSections,
  type BackupSelection,
  defaults,
  type Settings,
  type Snapshot,
  type ImportData,
  type BackupBookmark,
  type ImportReport,
  type SearchProviderId,
} from '../types/models';
import { normalizeUrl, validateSettings } from './validation';
import { isBookmark, isFolder } from '../modules/dial/modules/bookmarks/helpers/folders';
import { withDataLock } from '../shared/infrastructure/browser/dataLock';
export { withDataLock } from '../shared/infrastructure/browser/dataLock';
export class Repository {
  private module: BookmarksModule;
  private images: AssetsPort;
  private metadata: AutoNamesPort;
  constructor(
    private db: DialDatabase,
    private settings: SettingsPort,
    readonly bookmarks: BookmarksPort,
    root: RootPort,
    module?: BookmarksModule,
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
      includeBackground ? this.db.assets.get('background') : undefined,
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
  async saveSettings(
    settings: Settings,
    background?: Blob | null,
    rootId?: string,
    replace = false,
  ) {
    const next = validateSettings(settings);
    if (rootId !== undefined) await this.folder(rootId);
    const previous = await this.settings.getValue();
    let previousSettings: Settings;
    try {
      previousSettings = validateSettings(previous?.value);
    } catch {
      previousSettings = { ...defaults };
    }
    const settingsChanged = (Object.keys(defaults) as Array<keyof Settings>).some(
      (key) => next[key] !== previousSettings[key],
    );
    const previousBackground =
      background !== undefined ? await this.db.assets.get('background') : undefined;
    let wroteSettings = false,
      wroteBackground = false;
    try {
      if (settingsChanged || replace) {
        await this.settings.setValue({ value: next }, replace);
        wroteSettings = true;
      }
      if (background !== undefined) {
        if (background) await this.db.assets.put({ key: 'background', blob: background });
        else await this.db.assets.delete('background');
        wroteBackground = true;
      }
      // Commit the source last: failed writes cannot silently switch the root.
      if (rootId !== undefined) await this.selectRoot(rootId);
    } catch (error) {
      const rollback = await Promise.allSettled([
        wroteSettings
          ? this.settings.setValue(previous ?? { value: { ...defaults } })
          : Promise.resolve(),
        wroteBackground
          ? previousBackground
            ? this.db.assets.put(previousBackground)
            : this.db.assets.delete('background')
          : Promise.resolve(),
      ]);
      const detail = rollback.some((result) => result.status === 'rejected')
        ? message('settings.errors.partial_restore')
        : '';
      throw new LocalizedError(joinMessages([errorMessage(error), detail], ''));
    }
  }
  async saveSearchProvider(searchProvider: SearchProviderId) {
    await this.patchSettings({ searchProvider });
  }
  async patchSettings(patch: Partial<Settings>): Promise<Settings> {
    if (Object.keys(patch).some((key) => !Object.hasOwn(defaults, key)))
      throw new LocalizedError(message('validation.settings.unknown_field'));
    const current = validateSettings((await this.settings.getValue())?.value);
    const next = validateSettings({ ...current, ...patch });
    await this.saveSettings(next);
    return next;
  }
  async reset() {
    await this.saveSettings({ ...defaults }, null, undefined, true);
    await this.images.clear();
    await this.metadata.clear();
  }
  async saveBackground(background: Blob | null) {
    if (background) await this.db.assets.put({ key: 'background', blob: background });
    else await this.db.assets.delete('background');
  }
  async exportData(
    warning: (message: MessageText) => void = () => {},
    selection: BackupSelection = allBackupSections,
  ): Promise<ImportData> {
    const children =
      (selection.bookmarks || selection.images) && this.rootId
        ? await this.bookmarks.getChildren((await this.rootNode()).id)
        : [];
    const row = async (node: BookmarkNode): Promise<BackupBookmark> => {
      const result: BackupBookmark = { title: node.title, url: node.url! };
      try {
        const cache = selection.images
          ? await this.images.getStored(node.id, node.url!)
          : undefined;
        for (const key of ['thumbnail', 'favicon'] as const)
          if (cache?.[key]) {
            result[key] = cache[key];
          }
        const marker = await this.metadata.get(node.id);
        if (
          selection.bookmarks &&
          marker?.url === node.url &&
          node.title === new URL(node.url!).hostname
        )
          result.autoName = true;
      } catch {
        warning(
          message('backup.export.warnings.assets_or_name_unreadable', { item_name: node.title }),
        );
      }
      return result;
    };
    const entries: ImportData['entries'] = [];
    for (const node of children) {
      if (isBookmark(node)) entries.push(await row(node));
      else if (isFolder(node) && !node.unmodifiable) {
        const nested = await this.bookmarks.getChildren(node.id),
          rows = [];
        if (nested.some(isFolder))
          warning(
            message('backup.export.warnings.nested_folders_excluded', { item_name: node.title }),
          );
        for (const child of nested.filter(isBookmark)) rows.push(await row(child));
        entries.push({ title: node.title, children: rows });
      }
    }
    return {
      entries,
      ...(!selection.bookmarks ? { bookmarks: false as const } : {}),
      ...(selection.settings
        ? { settings: validateSettings((await this.settings.getValue())?.value) }
        : {}),
      ...(selection.background
        ? { background: (await this.db.assets.get('background'))?.blob ?? null }
        : {}),
    };
  }
  async importData(
    data: ImportData,
    destination: string,
    expectedSettings?: Settings,
    selection: BackupSelection = allBackupSections,
  ): Promise<ImportReport> {
    const includeBookmarks = selection.bookmarks && data.bookmarks !== false;
    const includeImages = selection.images;
    const target = includeBookmarks || includeImages ? await this.folder(destination) : undefined;
    const checkDestination = async () => {
      const node = await this.node(destination);
      if (!isFolder(node) || node.unmodifiable || node.parentId !== target?.parentId)
        throw new LocalizedError(message('backup.import.errors.destination_unavailable'));
    };
    if (selection.settings && data.settings && expectedSettings) {
      const currentSettings = validateSettings((await this.settings.getValue())?.value);
      if (
        (Object.keys(defaults) as Array<keyof Settings>).some(
          (key) => currentSettings[key] !== expectedSettings[key],
        )
      )
        throw new LocalizedError(message('backup.import.errors.settings_changed'));
    }
    const report: ImportReport = { bookmarks: 0, folders: 0, images: 0, warnings: [] };
    // Consume existing siblings once, preserving intentional repeated entries in the backup.
    const siblings = new Map<string, BookmarkNode[]>();
    const take = async (parentId: string, title: string, url?: string) => {
      if (!siblings.has(parentId))
        siblings.set(parentId, await this.bookmarks.getChildren(parentId));
      const nodes = siblings.get(parentId)!;
      const index = nodes.findIndex(
        (node) =>
          !node.unmodifiable &&
          node.title === title &&
          (url === undefined ? isFolder(node) : isBookmark(node) && node.url === url),
      );
      return index < 0 ? undefined : nodes.splice(index, 1)[0];
    };
    const add = async (row: BackupBookmark, parentId: string) => {
      await checkDestination();
      if (parentId !== destination) {
        const folder = await this.node(parentId);
        if (!isFolder(folder) || folder.unmodifiable || folder.parentId !== destination)
          throw new LocalizedError(message('backup.import.errors.folder_moved_or_deleted'));
      }
      const existing = await take(parentId, row.title, row.url);
      if (!existing && !includeBookmarks) {
        if (row.thumbnail || row.favicon) report.skipped = (report.skipped ?? 0) + 1;
        return;
      }
      const node = existing
        ? await this.node(existing.id)
        : await this.bookmarks.create({ parentId, title: row.title, url: row.url });
      if (!existing) report.bookmarks++;
      if (
        !isBookmark(node) ||
        node.unmodifiable ||
        node.parentId !== parentId ||
        node.title !== row.title ||
        node.url !== row.url
      )
        throw new LocalizedError(message('backup.import.errors.bookmark_changed'));
      for (const key of ['thumbnail', 'favicon'] as const)
        if (includeImages && row[key]) {
          try {
            await this.cache(node.id, row.url, key, row[key], { title: row.title, parentId });
            report.images++;
          } catch {
            report.warnings.push(
              message('backup.import.warnings.image_save_failed', {
                bookmark_name: row.title,
                image_type: key,
              }),
            );
          }
        }
      if (row.autoName && !existing)
        try {
          await this.metadata.put({
            bookmarkId: node.id,
            url: row.url,
            token: crypto.randomUUID(),
          });
        } catch {
          report.warnings.push(
            message('backup.import.warnings.auto_name_save_failed', { item_name: row.title }),
          );
        }
    };
    try {
      for (const entry of includeBookmarks || includeImages ? data.entries : []) {
        await checkDestination();
        if ('url' in entry) await add(entry, destination);
        else {
          const existing = await take(destination, entry.title);
          if (!existing && !includeBookmarks) {
            const missing = entry.children.filter((row) => row.thumbnail || row.favicon).length;
            if (missing) report.skipped = (report.skipped ?? 0) + missing;
            continue;
          }
          const folder = existing
            ? await this.node(existing.id)
            : await this.bookmarks.create({ parentId: destination, title: entry.title });
          if (!existing) report.folders++;
          if (
            !isFolder(folder) ||
            folder.unmodifiable ||
            folder.parentId !== destination ||
            folder.title !== entry.title
          )
            throw new LocalizedError(message('backup.import.errors.folder_changed'));
          for (const child of entry.children) await add(child, folder.id);
        }
      }
      const settings = selection.settings ? data.settings : undefined,
        background = selection.background ? data.background : undefined;
      if (settings) await this.saveSettings(settings, background, undefined, true);
      else if (background !== undefined) {
        if (background) await this.db.assets.put({ key: 'background', blob: background });
        else await this.db.assets.delete('background');
      }
      if (settings) report.settings = true;
      if (background !== undefined) report.background = true;
    } catch (error) {
      report.error = message('backup.import.errors.interrupted', { error: errorMessage(error) });
    }
    return report;
  }
}
