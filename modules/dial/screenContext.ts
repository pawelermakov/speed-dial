import { inject, provide, type InjectionKey } from 'vue';
import type { useNewtabScreen } from './composables/useNewtabScreen';
const key: InjectionKey<ReturnType<typeof useNewtabScreen>> = Symbol('newtab-screen');
export function provideScreen(screen: ReturnType<typeof useNewtabScreen>) {
  provide(key, screen);
}
export function useScreen() {
  const screen = inject(key);
  if (!screen) throw new Error('Newtab screen was not provided');
  return screen;
}
