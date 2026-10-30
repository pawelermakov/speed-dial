import { watch, onUnmounted } from 'vue';
import type { ThemeMode } from '../types/models';

/** Storage is authoritative; the synchronous mirror only restores the first paint. */
export function useTheme(theme: () => ThemeMode, ready: () => boolean) {
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme:dark)');
  let mode: ThemeMode =
    root.dataset.themeMode === 'light' || root.dataset.themeMode === 'dark'
      ? root.dataset.themeMode
      : 'system';
  function apply() {
    const resolved = mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
    root.style.colorScheme = resolved;
  }
  apply();
  function changed() {
    if (mode === 'system') apply();
  }
  system.addEventListener('change', changed);
  const stop = watch(
    [theme, ready],
    ([value, loaded]) => {
      if (!loaded) return;
      mode = value;
      apply();
      try {
        localStorage.setItem('speed-dial-theme', mode);
      } catch {
        /* The theme still works without its startup mirror. */
      }
    },
    { immediate: true, flush: 'sync' },
  );
  onUnmounted(() => {
    stop();
    system.removeEventListener('change', changed);
  });
}
