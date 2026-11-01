import type { BackupPorts, IBackupService } from './interfaces';
import { message } from '../../../common/i18n/messages';
import { defaults, type Settings } from '../../settings';
import type { BookmarkNode } from '../../bookmarks';
import { isBookmark, isFolder } from '../../bookmarks/folders';
import {
  allBackupSections,
  type BackupSelection,
  type BackupBookmark,
  type ImportData,
  type ImportReport,
} from '../entities/models';
import type { MessageText } from '../../../common/i18n/contracts';
export class BackupService implements IBackupService {
  constructor(private readonly ports: BackupPorts) {}

  reset = async () => {
    await this.ports.settings.saveSettings({
      settings: { ...defaults },
      background: null,
      replace: true,
    });
    await this.ports.data.clearAssets();
    await this.ports.data.clearAutoNames();
  };
  exportData = async (
    warning: (message: MessageText) => void = () => {},
    selection: BackupSelection = allBackupSections,
  ): Promise<ImportData> => {
    const children =
      (selection.bookmarks || selection.images) && this.ports.source.rootId
        ? await this.ports.data.getChildren((await this.ports.source.rootNode()).id)
        : [];
    const row = async (node: BookmarkNode): Promise<BackupBookmark> => {
      const result: BackupBookmark = { title: node.title, url: node.url! };
      try {
        const cache = selection.images
          ? await this.ports.data.readAssets(node.id, node.url!)
          : undefined;
        for (const key of ['thumbnail', 'favicon'] as const)
          if (cache?.[key]) {
            result[key] = cache[key];
          }
        const marker = await this.ports.data.readAutoName(node.id);
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
        const nested = await this.ports.data.getChildren(node.id),
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
        ? { settings: this.ports.validate((await this.ports.settings.getValue())?.value) }
        : {}),
      ...(selection.background
        ? { background: (await this.ports.appearance.readStored())?.blob ?? null }
        : {}),
    };
  };
  importData = async (
    data: ImportData,
    destination: string,
    expectedSettings?: Settings,
    selection: BackupSelection = allBackupSections,
  ): Promise<ImportReport> => {
    const includeBookmarks = selection.bookmarks && data.bookmarks !== false;
    const includeImages = selection.images;
    const target =
      includeBookmarks || includeImages ? await this.ports.source.folder(destination) : undefined;
    const checkDestination = async () => {
      const node = await this.ports.source.node(destination);
      if (!isFolder(node) || node.unmodifiable || node.parentId !== target?.parentId)
        throw this.ports.error(message('backup.import.errors.destination_unavailable'));
    };
    if (selection.settings && data.settings && expectedSettings) {
      const currentSettings = this.ports.validate((await this.ports.settings.getValue())?.value);
      if (
        (Object.keys(defaults) as Array<keyof Settings>).some(
          (key) => currentSettings[key] !== expectedSettings[key],
        )
      )
        throw this.ports.error(message('backup.import.errors.settings_changed'));
    }
    const report: ImportReport = { bookmarks: 0, folders: 0, images: 0, warnings: [] };
    // Consume existing siblings once, preserving intentional repeated entries in the backup.
    const siblings = new Map<string, BookmarkNode[]>();
    const take = async (parentId: string, title: string, url?: string) => {
      if (!siblings.has(parentId))
        siblings.set(parentId, await this.ports.data.getChildren(parentId));
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
        const folder = await this.ports.source.node(parentId);
        if (!isFolder(folder) || folder.unmodifiable || folder.parentId !== destination)
          throw this.ports.error(message('backup.import.errors.folder_moved_or_deleted'));
      }
      const existing = await take(parentId, row.title, row.url);
      if (!existing && !includeBookmarks) {
        if (row.thumbnail || row.favicon) report.skipped = (report.skipped ?? 0) + 1;
        return;
      }
      const node = existing
        ? await this.ports.source.node(existing.id)
        : await this.ports.data.create({ parentId, title: row.title, url: row.url });
      if (!existing) report.bookmarks++;
      if (
        !isBookmark(node) ||
        node.unmodifiable ||
        node.parentId !== parentId ||
        node.title !== row.title ||
        node.url !== row.url
      )
        throw this.ports.error(message('backup.import.errors.bookmark_changed'));
      for (const key of ['thumbnail', 'favicon'] as const)
        if (includeImages && row[key]) {
          try {
            await this.ports.cache(node.id, row.url, key, row[key], {
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
          await this.ports.data.saveAutoName({
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
            ? await this.ports.source.node(existing.id)
            : await this.ports.data.create({ parentId: destination, title: entry.title });
          if (!existing) report.folders++;
          if (
            !isFolder(folder) ||
            folder.unmodifiable ||
            folder.parentId !== destination ||
            folder.title !== entry.title
          )
            throw this.ports.error(message('backup.import.errors.folder_changed'));
          for (const child of entry.children) await add(child, folder.id);
        }
      }
      const settings = selection.settings ? data.settings : undefined,
        background = selection.background ? data.background : undefined;
      if (settings) await this.ports.settings.saveSettings({ settings, background, replace: true });
      else if (background !== undefined) {
        await this.ports.appearance.save(background);
      }
      if (settings) report.settings = true;
      if (background !== undefined) report.background = true;
    } catch (error) {
      report.error = message('backup.import.errors.interrupted', {
        error: this.ports.errorText(error),
      });
    }
    return report;
  };
}
