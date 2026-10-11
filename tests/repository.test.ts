import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialDatabase } from '../services/database';
import { Repository } from '../services/repository';
import type { SettingsEnvelope, SettingsPort } from '../services/settings';
import { defaults, type Snapshot } from '../types/models';
import { parseImport } from '../services/importExport';
import fixture from './fixtures/legacy-export.json';

let db: DialDatabase;
let repo: Repository;
let stored: SettingsEnvelope | null;
let port: SettingsPort;
beforeEach(() => {
  db = new DialDatabase('test-' + crypto.randomUUID());
  stored = null;
  port = { getValue: vi.fn(async () => stored), setValue: vi.fn(async value => { stored = structuredClone(value); }) };
  repo = new Repository(db, port);
});
afterEach(async () => { await db.delete(); });
const add = (url = 'https://example.com') => repo.add({ url, title: 'Свой заголовок', favicon: '', thumbnail: null });

describe('IndexedDB persistence and transactions', () => {
  it('CRUD persists after closing/reopening DB; thumbnails preserve custom title', async () => {
    await repo.initialize(null);
    const id = await add();
    await repo.edit(id, 'https://example.org', 'Изменено');
    const image = new Blob(['image'], { type: 'image/png' });
    await repo.thumbnail(id, 'https://example.org/', image);
    db.close();
    await db.open();
    const loaded = await repo.load();
    expect(loaded.tabs[0]?.title).toBe('Изменено');
    expect(await loaded.tabs[0]?.thumbnail?.text()).toBe('image');
    await repo.remove(id);
    expect((await repo.load()).tabs).toEqual([]);
  });
  it('valid reorder and delete maintain contiguous positions; invalid reorder rolls back', async () => {
    const ids = [await add(), await add('https://b.example'), await add('https://c.example')];
    await repo.reorder([ids[2]!, ids[0]!, ids[1]!]);
    expect((await repo.load()).tabs.map(tab => tab.id)).toEqual([ids[2], ids[0], ids[1]]);
    await expect(repo.reorder([ids[0]!, ids[0]!, ids[1]!])).rejects.toThrow();
    await repo.remove(ids[0]!);
    expect((await repo.load()).tabs.map(tab => tab.position)).toEqual([1, 2]);
    await repo.reorder([ids[1]!, ids[2]!]);
    expect((await repo.load()).tabs.map(tab => tab.id)).toEqual([ids[1], ids[2]]);
  });
  it('repeated legacy import replaces rather than duplicates data', async () => {
    await add();
    const next = parseImport(JSON.stringify(fixture));
    await repo.replace(next); await repo.replace(next);
    expect((await repo.load()).tabs.length).toBe(2);
    expect((await repo.load()).settings.addButton).toBe(false);
  });
  it('invalid JSON cannot erase data', async () => {
    const id = await add();
    expect(() => parseImport('{"tabs":[{"url":"data:x"}]}')).toThrow();
    expect((await repo.load()).tabs[0]?.id).toBe(id);
  });
  it('IDB transaction abort leaves previous rows and background intact', async () => {
    await add();
    const before = await repo.load();
    const next: Snapshot = { ...before, tabs: [before.tabs[0]!, before.tabs[0]!] };
    await expect(repo.replace(next)).rejects.toThrow();
    expect((await repo.load()).tabs.length).toBe(1);
    expect(await db.journal.count()).toBe(0);
  });
  it('extension storage failure restores bookmarks/settings/background', async () => {
    await repo.initialize(null);
    await add();
    const background = new Blob(['background'], { type: 'image/png' });
    await repo.saveSettings({ ...defaults, space: 0 }, background);
    const before = await repo.load();
    vi.mocked(port.setValue).mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(repo.replace(parseImport(JSON.stringify(fixture)))).rejects.toThrow('Storage unavailable');
    const after = await repo.load();
    expect(after.tabs).toEqual(before.tabs);
    expect(after.settings).toEqual(before.settings);
    expect(await after.background?.text()).toBe('background');
    expect(await db.journal.count()).toBe(0);
  });
  it('crash journal rolls settings forward on next load', async () => {
    await repo.initialize(null);
    await db.journal.put({ key: 'settings', settings: { ...defaults, addButton: true } });
    expect((await repo.load()).settings.addButton).toBe(true);
    expect(await db.journal.count()).toBe(0);
  });
  it('migrates legacy settings only once, preserving old source and no Web SQL access', async () => {
    const getItem = vi.fn((key: string) => key === 'addButton' ? 'false' : key === 'verticalCenter' ? 'true' : null);
    const source = { getItem };
    expect((await repo.initialize(source)).settings.verticalCenter).toBe(true);
    const calls = getItem.mock.calls.length;
    await repo.initialize(source);
    expect(getItem.mock.calls.length).toBe(calls);
    await repo.reset();
    expect((await repo.initialize(source)).settings).toEqual(defaults);
  });
  it('failed migration can retry without losing legacy source', async () => {
    vi.mocked(port.setValue).mockRejectedValueOnce(new Error('quota'));
    await expect(repo.initialize(null)).rejects.toThrow('quota');
    expect(stored).toBeNull();
    expect((await repo.initialize(null)).settings).toEqual(defaults);
  });
  it('stale capture cannot overwrite edited/deleted bookmarks', async () => {
    const id = await add();
    await repo.edit(id, 'https://other.example', 'Title');
    await expect(repo.thumbnail(id, 'https://example.com/', new Blob(['x']))).rejects.toThrow();
    expect((await repo.load()).tabs[0]?.thumbnail).toBeNull();
    await repo.remove(id);
    await expect(repo.thumbnail(id, 'https://other.example/', new Blob(['x']))).rejects.toThrow();
  });
});
