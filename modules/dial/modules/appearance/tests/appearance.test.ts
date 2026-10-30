import { describe, it, expect } from 'vitest';
import { validateSettings } from '../../../../../services/validation';
import { serializeExport, parseImport } from '../../../../../services/importExport';
import { syncPatch } from '../../../../../services/settingsSchema';

describe('current settings contract', () => {
  it('roundtrips current settings through export and Sync', async () => {
    const settings = validateSettings({
      width: 75,
      space: 12,
      mailruEnabled: true,
      movieSearch: true,
      searchProvider: 'imdb',
    });
    const text = await serializeExport({ entries: [], settings, background: null });
    expect(JSON.parse(text).version).toBe(3);
    expect(parseImport(text).settings).toEqual(settings);
    expect(
      syncPatch(
        Object.fromEntries(
          Object.entries(settings).map(([key, value]) => ['settings.v1.' + key, value]),
        ),
      ),
    ).toEqual(settings);
  });
  it('rejects malformed boolean settings', () => {
    for (const value of ['true', 0, 1, null, {}])
      expect(() => validateSettings({ addButton: value })).toThrow();
    expect(validateSettings({ addButton: false }).addButton).toBe(false);
  });
});

it('rejects settings outside the current contract', () => {
  expect(() => validateSettings({ unexpected: true })).toThrow('Неизвестный параметр');
});
