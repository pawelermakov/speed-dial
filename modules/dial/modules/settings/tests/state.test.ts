import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaults } from '../entities/models';
import { validateSettings } from '../../../../../services/validation';
import { errorMessage } from '../../../../../shared/i18n/errors';
import { useSettingsState } from '../composables/useSettingsState';
const lifecycle = vi.hoisted(() => ({ unmount: [] as Array<() => void> }));
vi.mock('vue', async () => ({
  ...(await vi.importActual('vue')),
  onUnmounted: (callback: () => void) => lifecycle.unmount.push(callback),
}));
afterEach(() => lifecycle.unmount.splice(0).forEach((callback) => callback()));
function fixture() {
  let current = { ...defaults };
  const save = vi.fn(async (patch: Partial<typeof defaults>) => ({ ...current, ...patch })),
    flush = vi.fn(async () => {});
  const state = useSettingsState({
    current: () => current,
    canSave: () => true,
    validate: validateSettings,
    save,
    read: async () => current,
    setLanguage: () => {},
    publish: (value) => {
      current = value;
    },
    onReadError: () => {},
    errorText: errorMessage,
    flushSync: flush,
  });
  state.confirm(defaults);
  return { state, save, flush, current: () => current };
}
describe('settings editor state', () => {
  it('keeps a later write and unrelated remote fields after an earlier write fails', async () => {
    const f = fixture();
    let fail!: (error: Error) => void;
    f.save
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          }),
      )
      .mockResolvedValueOnce({ ...defaults, width: 90, space: 12 });
    const old = f.state.updateSettings({ width: 80 });
    f.state.confirm({ ...defaults, space: 12 });
    expect(f.current()).toMatchObject({ width: 80, space: 12 });
    expect(await f.state.updateSettings({ width: 90 })).toBe(true);
    fail(new Error('old failure'));
    expect(await old).toBe(false);
    expect(f.current()).toMatchObject({ width: 90, space: 12 });
    expect(f.state.errors.value).toEqual({});
  });
  it('flushes related editor writes before asking background to flush', async () => {
    const f = fixture();
    let finish!: () => void;
    const pending = f.state.track(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const flushed = f.state.flush();
    await Promise.resolve();
    expect(f.flush).not.toHaveBeenCalled();
    finish();
    await pending;
    await flushed;
    expect(f.flush).toHaveBeenCalledTimes(1);
  });
});
