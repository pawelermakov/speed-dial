import { onUnmounted } from 'vue';
import { contextKey } from '../common/ui/keyboard';
import type { DialState } from './screenTypes';
import type { Ref } from 'vue';
import type { ContextState } from './screenTypes';
import type { useBackupFlow } from './useBackupFlow';
export function usePageKeyboard({
  disabled,
  snapshot,
  overlayOpen,
  context,
  openingData,
  dataOpen,
  dataDialog,
  searching,
  openSearch,
  closeSearch,
  rememberContextTarget,
  closeContext,
  closeSettings,
}: Pick<DialState, 'snapshot'> & {
  disabled: Readonly<Ref<boolean>>;
  overlayOpen: Readonly<Ref<boolean>>;
  context: Ref<ContextState | undefined>;
  openingData: Ref<boolean>;
  dataOpen: Ref<boolean>;
  dataDialog: ReturnType<typeof useBackupFlow>['dataDialog'];
  searching: Readonly<Ref<boolean>>;
  openSearch(): void;
  closeSearch(): void;
  rememberContextTarget(element?: Element | null): void;
  closeContext(): void;
  closeSettings(): Promise<void>;
}) {
  function escape(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Escape' && openingData.value) {
      event.preventDefault();
      openingData.value = false;
      return;
    }
    if (
      contextKey(event) &&
      !overlayOpen.value &&
      !context.value &&
      !disabled.value &&
      !(event.target as HTMLElement).closest('input,textarea,select,[contenteditable],dialog')
    ) {
      event.preventDefault();
      rememberContextTarget(document.activeElement);
      context.value = { x: 24, y: 100 };
      return;
    }
    if (
      event.key === '/' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !disabled.value &&
      snapshot.value.settings.bookmarkSearch &&
      snapshot.value.rootId &&
      !overlayOpen.value &&
      !context.value &&
      !(event.target as HTMLElement).closest(
        'input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog,[role="dialog"]',
      )
    ) {
      event.preventDefault();
      openSearch();
      return;
    }
    if (event.key === 'Escape' && dataOpen.value) {
      event.preventDefault();
      dataDialog.value?.close();
      return;
    }
    if (
      event.key !== 'Escape' ||
      disabled.value ||
      event.defaultPrevented ||
      (event.target instanceof Element && event.target.closest('dialog'))
    )
      return;
    if (searching.value && !overlayOpen.value && !context.value) {
      event.preventDefault();
      closeSearch();
      return;
    }
    if (context.value) closeContext();
    else void closeSettings();
  }
  window.addEventListener('keydown', escape);
  onUnmounted(() => window.removeEventListener('keydown', escape));
}
