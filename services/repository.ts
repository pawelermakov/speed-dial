import type { DialDatabase } from './database';
import type { SettingsEnvelope, SettingsPort } from './settings';
import { defaults, type Bookmark, type Settings, type Snapshot } from '../types/models';
import { imageFromDataUrl } from './images';
import { legacySettings, normalizeUrl, safeFavicon, validateSettings } from './validation';

// The Web Lock spans IDB and extension storage and serializes open new tabs.
// It is independent of the lifetime of an MV3 background worker.
export async function withDataLock<T>(operation: () => Promise<T>): Promise<T> {
  return await navigator.locks.request('speed-dial-data', operation);
}
export class Repository {
  constructor(private db: DialDatabase, private settings: SettingsPort) {}
  async recover(): Promise<void> {
    const journal = await this.db.journal.get('settings');
    if (!journal) return;
    await this.settings.setValue({ value: journal.settings, legacyMigrated: true });
    await this.db.journal.delete('settings');
  }
  async load(): Promise<Snapshot> {
    await this.recover();
    const envelope = await this.settings.getValue();
    const [tabs, background] = await this.db.transaction('r', this.db.bookmarks, this.db.assets, async () =>
      Promise.all([this.db.bookmarks.orderBy('position').toArray(), this.db.assets.get('background')]));
    return { tabs, settings: envelope ? validateSettings(envelope.value) : { ...defaults }, background: background?.blob ?? null };
  }
  async initialize(source: Pick<Storage, 'getItem'> | null): Promise<Snapshot> {
    await this.recover();
    if (!(await this.settings.getValue())) {
      const old = legacySettings(source);
      const snapshot = await this.load();
      // No Web SQL emulation or deletion of legacy localStorage.
      await this.replace({ ...snapshot, settings: validateSettings(old), background: imageFromDataUrl(old.background, 'Старый фон') });
    }
    return this.load();
  }
  private async write(snapshot: Snapshot, journal?: Settings): Promise<void> {
    await this.db.transaction('rw', this.db.bookmarks, this.db.assets, this.db.journal, async () => {
      await this.db.bookmarks.clear();
      await this.db.bookmarks.bulkAdd(snapshot.tabs);
      await this.db.assets.clear();
      if (snapshot.background) await this.db.assets.put({ key: 'background', blob: snapshot.background });
      await this.db.journal.clear();
      if (journal) await this.db.journal.put({ key: 'settings', settings: journal });
    });
  }
  async replace(next: Snapshot): Promise<void> {
    await this.recover();
    const previous = await this.load();
    const oldEnvelope = await this.settings.getValue();
    // Commit data + target settings journal together. A crash rolls forward on
    // the next load; an ordinary storage failure rolls IDB back to the snapshot.
    await this.write(next, next.settings);
    try {
      await this.settings.setValue({ value: next.settings, legacyMigrated: true });
    } catch (error) {
      try {
        await this.write(previous);
        if (oldEnvelope) await this.settings.setValue(oldEnvelope);
      } catch {
        throw new Error('Сбой восстановления данных. Не выполняйте новые операции; перезагрузите вкладку для восстановления журнала.');
      }
      throw error;
    }
    // If removing the journal fails, the committed result is still recoverable.
    await this.db.journal.delete('settings');
  }
  async saveSettings(settings: Settings, background?: Blob | null): Promise<void> {
    const snapshot = await this.load();
    await this.replace({ ...snapshot, settings: validateSettings(settings), background: background === undefined ? snapshot.background : background });
  }
  async reset(): Promise<void> {
    await this.replace({ tabs: [], settings: { ...defaults }, background: null });
  }
  async add(input: Omit<Bookmark, 'id' | 'position'>): Promise<number> {
    const row = { ...input, url: normalizeUrl(input.url), favicon: safeFavicon(input.favicon) };
    return this.db.transaction('rw', this.db.bookmarks, async () => {
      const last = await this.db.bookmarks.orderBy('position').last();
      return this.db.bookmarks.add({ ...row, position: (last?.position ?? 0) + 1 } as Bookmark);
    });
  }
  async edit(id: number, url: string, title: string): Promise<void> {
    await this.db.transaction('rw', this.db.bookmarks, async () => {
      const current = await this.db.bookmarks.get(id);
      if (!current) throw new Error('Закладка больше не существует.');
      const normalized = normalizeUrl(url);
      await this.db.bookmarks.put({ ...current, url: normalized, title,
        ...(normalized !== current.url ? { thumbnail: null, favicon: '' } : {}) });
    });
  }
  async thumbnail(id: number, url: string, thumbnail: Blob, favicon?: string): Promise<void> {
    await this.db.transaction('rw', this.db.bookmarks, async () => {
      const current = await this.db.bookmarks.get(id);
      if (!current || current.url !== url) throw new Error('Закладка была удалена или изменена; эскиз не сохранён.');
      await this.db.bookmarks.put({ ...current, thumbnail, favicon: favicon ? safeFavicon(favicon) : current.favicon });
    });
  }
  async remove(id: number): Promise<void> {
    await this.db.transaction('rw', this.db.bookmarks, async () => {
      await this.db.bookmarks.delete(id);
      const tabs = await this.db.bookmarks.orderBy('position').toArray();
      await this.db.bookmarks.bulkPut(tabs.map((tab, index) => ({ ...tab, position: index + 1 })));
    });
  }
  async reorder(ids: number[]): Promise<void> {
    await this.db.transaction('rw', this.db.bookmarks, async () => {
      const tabs = await this.db.bookmarks.toArray();
      if (new Set(ids).size !== tabs.length || ids.length !== tabs.length || tabs.some(tab => !ids.includes(tab.id)))
        throw new Error('Список закладок изменился; повторите перетаскивание.');
      const positions = new Map(ids.map((id, index) => [id, index + 1]));
      await this.db.bookmarks.bulkPut(tabs.map(tab => ({ ...tab, position: positions.get(tab.id)! })));
    });
  }
}
