import { message } from '../../../../../shared/i18n/messages';
import { defaults, type Settings, type SettingsPort, type SettingsService } from '../../settings';
import type { AppearanceService } from '../../appearance';
import type { AssetsPort, AutoNamesPort, BookmarksPort, BookmarkNode } from '../../bookmarks';
import { isBookmark, isFolder } from '../../bookmarks/folders';
import {
  allBackupSections,
  type BackupSelection,
  type BackupBookmark,
  type ImportData,
  type ImportReport,
} from '../entities/models';
import type { MessageText } from '../../../../../shared/i18n/contracts';
export interface BackupPorts {
  source: {
    readonly rootId: string | null;
    rootNode(): Promise<BookmarkNode>;
    folder(id: string): Promise<BookmarkNode>;
    node(id: string): Promise<BookmarkNode>;
    cache(
      id: string,
      url: string,
      resource: 'favicon' | 'thumbnail',
      blob: Blob,
      expected?: { title: string; parentId?: string },
    ): Promise<void>;
  };
  bookmarks: BookmarksPort;
  assets: Pick<AssetsPort, 'getStored' | 'clear'>;
  metadata: Pick<AutoNamesPort, 'get' | 'put' | 'clear'>;
  settings: SettingsPort;
  preferences: SettingsService;
  appearance: AppearanceService;
  validate(input: unknown): Settings;
  error(message: MessageText): Error;
  errorText(error: unknown): MessageText;
}
export function createBackupService(ports: BackupPorts) {
  async function reset() {
    await ports.preferences.saveSettings({ ...defaults }, null, undefined, true);
    await ports.assets.clear();
    await ports.metadata.clear();
  }
  async function exportData(
    warning: (message: MessageText) => void = () => {},
    selection: BackupSelection = allBackupSections,
  ): Promise<ImportData> {
    const children =
      (selection.bookmarks || selection.images) && ports.source.rootId
        ? await ports.bookmarks.getChildren((await ports.source.rootNode()).id)
        : [];
    const row = async (node: BookmarkNode): Promise<BackupBookmark> => {
      const result: BackupBookmark = { title: node.title, url: node.url! };
      try {
        const cache = selection.images
          ? await ports.assets.getStored(node.id, node.url!)
          : undefined;
        for (const key of ['thumbnail', 'favicon'] as const)
          if (cache?.[key]) {
            result[key] = cache[key];
          }
        const marker = await ports.metadata.get(node.id);
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
        const nested = await ports.bookmarks.getChildren(node.id),
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
        ? { settings: ports.validate((await ports.settings.getValue())?.value) }
        : {}),
      ...(selection.background
        ? { background: (await ports.appearance.readStored())?.blob ?? null }
        : {}),
    };
  }
  async function importData(
    data: ImportData,
    destination: string,
    expectedSettings?: Settings,
    selection: BackupSelection = allBackupSections,
  ): Promise<ImportReport> {
    const includeBookmarks = selection.bookmarks && data.bookmarks !== false;
    const includeImages = selection.images;
    const target =
      includeBookmarks || includeImages ? await ports.source.folder(destination) : undefined;
    const checkDestination = async () => {
      const node = await ports.source.node(destination);
      if (!isFolder(node) || node.unmodifiable || node.parentId !== target?.parentId)
        throw ports.error(message('backup.import.errors.destination_unavailable'));
    };
    if (selection.settings && data.settings && expectedSettings) {
      const currentSettings = ports.validate((await ports.settings.getValue())?.value);
      if (
        (Object.keys(defaults) as Array<keyof Settings>).some(
          (key) => currentSettings[key] !== expectedSettings[key],
        )
      )
        throw ports.error(message('backup.import.errors.settings_changed'));
    }
    const report: ImportReport = { bookmarks: 0, folders: 0, images: 0, warnings: [] };
    // Consume existing siblings once, preserving intentional repeated entries in the backup.
    const siblings = new Map<string, BookmarkNode[]>();
    const take = async (parentId: string, title: string, url?: string) => {
      if (!siblings.has(parentId))
        siblings.set(parentId, await ports.bookmarks.getChildren(parentId));
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
        const folder = await ports.source.node(parentId);
        if (!isFolder(folder) || folder.unmodifiable || folder.parentId !== destination)
          throw ports.error(message('backup.import.errors.folder_moved_or_deleted'));
      }
      const existing = await take(parentId, row.title, row.url);
      if (!existing && !includeBookmarks) {
        if (row.thumbnail || row.favicon) report.skipped = (report.skipped ?? 0) + 1;
        return;
      }
      const node = existing
        ? await ports.source.node(existing.id)
        : await ports.bookmarks.create({ parentId, title: row.title, url: row.url });
      if (!existing) report.bookmarks++;
      if (
        !isBookmark(node) ||
        node.unmodifiable ||
        node.parentId !== parentId ||
        node.title !== row.title ||
        node.url !== row.url
      )
        throw ports.error(message('backup.import.errors.bookmark_changed'));
      for (const key of ['thumbnail', 'favicon'] as const)
        if (includeImages && row[key]) {
          try {
            await ports.source.cache(node.id, row.url, key, row[key], {
              title: row.title,
              parentId,
            });
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
          await ports.metadata.put({
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
            ? await ports.source.node(existing.id)
            : await ports.bookmarks.create({ parentId: destination, title: entry.title });
          if (!existing) report.folders++;
          if (
            !isFolder(folder) ||
            folder.unmodifiable ||
            folder.parentId !== destination ||
            folder.title !== entry.title
          )
            throw ports.error(message('backup.import.errors.folder_changed'));
          for (const child of entry.children) await add(child, folder.id);
        }
      }
      const settings = selection.settings ? data.settings : undefined,
        background = selection.background ? data.background : undefined;
      if (settings) await ports.preferences.saveSettings(settings, background, undefined, true);
      else if (background !== undefined) {
        await ports.appearance.save(background);
      }
      if (settings) report.settings = true;
      if (background !== undefined) report.background = true;
    } catch (error) {
      report.error = message('backup.import.errors.interrupted', { error: ports.errorText(error) });
    }
    return report;
  }
  return { exportData, importData, reset };
}
export type BackupService = ReturnType<typeof createBackupService>;
