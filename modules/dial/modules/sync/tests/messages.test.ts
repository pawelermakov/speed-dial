import { describe, expect, it } from 'vitest';
import { parseSettingsSyncMessage } from '../adapters/messages';
describe('sync wire validation', () => {
  it.each([
    null,
    [],
    { type: 'other', action: 'retry' },
    { type: 'settings-sync', action: 'other' },
    { type: 'settings-sync', action: 'patch', value: [] },
    { type: 'settings-sync', action: 'folder', value: 'x'.repeat(257) },
    { type: 'settings-sync', action: 'confirm', value: 'true' },
  ])('rejects malformed input %j', (value) => {
    expect(parseSettingsSyncMessage(value)).toBeNull();
  });
  it('decodes valid messages while leaving untrusted patch fields to coordinator validation', () => {
    for (const action of ['initialize', 'retry', 'flush'])
      expect(parseSettingsSyncMessage({ type: 'settings-sync', action })).toEqual({
        type: 'settings-sync',
        action,
      });
    expect(
      parseSettingsSyncMessage({
        type: 'settings-sync',
        action: 'patch',
        value: { width: 'bad', space: 12 },
      }),
    ).toEqual({ type: 'settings-sync', action: 'patch', value: { width: 'bad', space: 12 } });
    expect(
      parseSettingsSyncMessage({ type: 'settings-sync', action: 'confirm', value: false }),
    ).toEqual({ type: 'settings-sync', action: 'confirm', value: false });
    expect(
      parseSettingsSyncMessage({ type: 'settings-sync', action: 'folder', value: 'root' }),
    ).toEqual({ type: 'settings-sync', action: 'folder', value: 'root' });
  });
});
