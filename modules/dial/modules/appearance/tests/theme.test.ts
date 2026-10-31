import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaults } from '../../settings';
import { type ThemeMode } from '..';
import { validateSettings } from '../../../../../services/validation';
import { parseImport, serializeExport } from '../../backup/adapters/json';
import { syncPatch } from '../../settings/schema';
const state = vi.hoisted(() => ({ dispose: [] as Array<() => void> }));
vi.mock('vue', async () => ({
  ...(await vi.importActual<typeof import('vue')>('vue')),
  onUnmounted: (fn: () => void) => state.dispose.push(fn),
}));
import { useTheme } from '../composables/useTheme';
afterEach(() => {
  state.dispose.splice(0).forEach((fn) => fn());
  vi.unstubAllGlobals();
});
const bootstrap = readFileSync(
  new URL('../../../../../public/wallpaper-bootstrap.js', import.meta.url),
  'utf8',
);
function start(saved: unknown, dark: boolean, preview?: string, unavailable = false) {
  const root = {
    dataset: {} as Record<string, string>,
    style: { colorScheme: '', background: '', minHeight: '', setProperty: vi.fn() },
  };
  runInNewContext(bootstrap, {
    document: { documentElement: root },
    matchMedia: () => ({ matches: dark }),
    localStorage: {
      getItem: (key: string) => {
        if (unavailable) throw Error('denied');
        return key === 'speed-dial-theme' ? saved : preview;
      },
    },
  });
  return root;
}
describe('theme startup and persistence', () => {
  it.each(['light', 'dark'] as const)(
    'restores explicit %s before the application loads',
    (mode) => {
      const root = start(mode, mode !== 'dark');
      expect(root.dataset).toEqual({ theme: mode, themeMode: mode });
      expect(root.style.colorScheme).toBe(mode);
      expect(root.style.background).toContain(mode === 'dark' ? '#16191f' : '#e9edf2');
    },
  );
  it('uses the system when no valid startup preference is available', () => {
    for (const saved of [null, 'system', 'unknown', {}])
      expect(start(saved, true).dataset.theme).toBe('dark');
    expect(start('light', true, undefined, true).dataset.theme).toBe('dark');
    expect(() => validateSettings({ theme: 'unknown' })).toThrow('тема');
    expect(defaults.theme).toBe('system');
  });
  it('keeps valid wallpaper previews intact in dark mode and rejects malformed previews', () => {
    const preview = 'data:image/jpeg;base64,YWJj';
    expect(start('dark', false, preview).style.setProperty).toHaveBeenCalledWith(
      '--startup-background',
      'linear-gradient(var(--wallpaper-shade, rgb(0 0 0 / .25)),var(--wallpaper-shade, rgb(0 0 0 / .25))),url("' +
        preview +
        '")',
    );
    expect(
      start('dark', false, 'https://example.com/image').style.setProperty,
    ).not.toHaveBeenCalled();
  });
  it.each(['system', 'light', 'dark'] as const)(
    'roundtrips %s through JSON v3 and the existing Sync schema',
    async (theme) => {
      const text = await serializeExport({
        entries: [],
        settings: { ...defaults, theme },
        background: null,
      });
      expect(JSON.parse(text).version).toBe(3);
      expect(parseImport(text).settings!.theme).toBe(theme);
      expect(syncPatch({ 'settings.v1.theme': theme })).toEqual({ theme });
      expect(syncPatch({ 'settings.v1.theme': 'unknown' })).toEqual({});
    },
  );
  it('preserves the startup theme while loading, follows OS changes only in system mode, and releases listeners', () => {
    const root = start('dark', false);
    const listeners = new Set<() => void>();
    const media = {
      matches: false,
      addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
    };
    const storage = { setItem: vi.fn() };
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('window', { matchMedia: () => media });
    vi.stubGlobal('localStorage', storage);
    const theme = ref<ThemeMode>('system'),
      ready = ref(false);
    useTheme(
      () => theme.value,
      () => ready.value,
    );
    expect(root.dataset.theme).toBe('dark');
    expect(storage.setItem).not.toHaveBeenCalled();
    ready.value = true;
    expect(root.dataset.theme).toBe('light');
    media.matches = true;
    listeners.forEach((fn) => fn());
    expect(root.dataset.theme).toBe('dark');
    theme.value = 'light';
    listeners.forEach((fn) => fn());
    expect(root.dataset.theme).toBe('light');
    expect(storage.setItem).toHaveBeenLastCalledWith('speed-dial-theme', 'light');
    state.dispose.splice(0).forEach((fn) => fn());
    expect(listeners.size).toBe(0);
  });
  it('applies settings even when the first-paint cache cannot be written', () => {
    const root = start(null, false);
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('window', {
      matchMedia: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw Error('denied');
      },
    });
    expect(() =>
      useTheme(
        () => 'dark',
        () => true,
      ),
    ).not.toThrow();
    expect(root.dataset.theme).toBe('dark');
  });
});
