import { describe, expect, it, vi } from 'vitest';
import { defaults } from '../entities/models';
import { createSettingsService } from '../services/settings';
import { validateSettings } from '../../../../../services/validation';
import { LocalizedError, errorMessage } from '../../../../../shared/i18n/errors';
import { formatMessage } from '../../../../../tests/helpers/i18n';
import { message } from '../../../../../shared/i18n/messages';
import type { BackgroundAsset } from '../../appearance';
describe('settings persistence ports', () => {
  it.each([false, true])(
    'restores settings/background after source failure, rollback failure=%s',
    async (failRollback) => {
      let stored = { value: { ...defaults } };
      const original: BackgroundAsset = { key: 'background', blob: new Blob(['old']) };
      let background = original;
      const service = createSettingsService({
        storage: {
          getValue: async () => stored,
          setValue: async (value) => {
            stored = value;
          },
        },
        background: {
          readStored: async () => background,
          save: async (blob) => {
            background = { key: 'background', blob: blob! };
          },
          restore: async (value) => {
            if (failRollback) throw new Error('restore failed');
            background = value!;
          },
        },
        source: {
          folder: async () => ({}),
          selectRoot: async () => {
            throw new Error('source failed');
          },
        },
        validate: validateSettings,
        error: (value) => new LocalizedError(value),
        errorText: errorMessage,
      });
      const failure = service.saveSettings({ ...defaults, width: 80 }, new Blob(['new']), 'other');
      await expect(failure).rejects.toThrowLocalized('source failed');
      expect(stored.value).toEqual(defaults);
      if (failRollback)
        await expect(failure).rejects.toThrowLocalized(
          formatMessage(message('settings.errors.partial_restore')),
        );
      else expect(background).toBe(original);
    },
  );
  it('merges a patch with the current stored values', async () => {
    let stored = { value: { ...defaults, space: 12 } };
    const save = vi.fn(async (value: typeof stored) => {
      stored = value;
    });
    const service = createSettingsService({
      storage: { getValue: async () => stored, setValue: save },
      background: {
        readStored: async () => undefined,
        save: async () => {},
        restore: async () => {},
      },
      source: { folder: async () => ({}), selectRoot: async () => {} },
      validate: validateSettings,
      error: (value) => new LocalizedError(value),
      errorText: errorMessage,
    });
    expect(await service.patchSettings({ width: 85 })).toMatchObject({ width: 85, space: 12 });
    expect(stored.value.space).toBe(12);
  });
});
