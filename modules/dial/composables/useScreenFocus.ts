import { shallowRef, watch, nextTick } from 'vue';
import type { Bookmark } from '../../../types/models';
import type { DialState } from '../screenTypes';
import type { Ref } from 'vue';
import type { FocusTarget, ContextState } from '../screenTypes';
export function useScreenFocus({
  snapshot,
  results,
  disabled,
  overlayOpen,
  context,
}: Pick<DialState, 'snapshot'> & {
  results: Ref<Bookmark[]>;
  disabled: Readonly<Ref<boolean>>;
  overlayOpen: Readonly<Ref<boolean>>;
  context: Ref<ContextState | undefined>;
}) {
  function focusTarget(element: Element | null): FocusTarget | undefined {
    if (!(element instanceof HTMLElement) || element === document.body || element.tabIndex < 0)
      return;
    const selector = element.matches('.bookmark')
      ? '.bookmark'
      : element.matches('[data-folder-id]')
        ? '[data-folder-id]'
        : undefined;
    return {
      element,
      selector,
      id: element.dataset.bookmarkId ?? element.dataset.folderId,
      index: selector ? Array.from(document.querySelectorAll(selector)).indexOf(element) : 0,
    };
  }
  function restorePageFocus(target?: FocusTarget) {
    if (overlayOpen.value || context.value) return;
    const candidates = target?.selector
      ? Array.from(document.querySelectorAll<HTMLElement>(target.selector))
      : [];
    const same = candidates.find(
      (el) => (el.dataset.bookmarkId ?? el.dataset.folderId) === target?.id,
    );
    const element =
      same ??
      (target?.element.isConnected
        ? target.element
        : candidates[Math.min(target?.index ?? 0, candidates.length - 1)]);
    const usable = (el?: HTMLElement | null) =>
      !!el &&
      el.isConnected &&
      !el.closest('[inert],[aria-hidden="true"]') &&
      !el.matches(':disabled') &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden';
    const fallbacks = target?.selector
      ? [
          '.add-card:not(:disabled)',
          '.search input:not(:disabled)',
          '.folder-root:not(:disabled)',
          '.settings-trigger:not(:disabled)',
        ]
      : ['.settings-trigger:not(:disabled)'];
    const fallback = fallbacks
      .map((selector) => document.querySelector<HTMLElement>(selector))
      .find((el) => usable(el));
    if (usable(element)) element!.focus({ preventScroll: true });
    else if (usable(fallback)) fallback!.focus({ preventScroll: true });
  }
  const contextTarget = shallowRef<FocusTarget>();
  function rememberContextTarget(element: Element | null = document.activeElement) {
    contextTarget.value = focusTarget(element);
  }
  function closeContext() {
    context.value = undefined;
    restorePageFocus(contextTarget.value);
  }
  // Capture focus before Vue removes a node. Restore only if that update lost it;
  // typing, pointer focus and a newly opened overlay always take precedence.
  watch(
    [snapshot, results, disabled],
    async () => {
      const previous = focusTarget(document.activeElement);
      await nextTick();
      if (!previous || overlayOpen.value || context.value) return;
      const active = document.activeElement;
      if (
        active === document.body ||
        (active === previous.element &&
          (!previous.element.isConnected || previous.element.closest('[inert]')))
      )
        restorePageFocus(previous);
    },
    { flush: 'pre' },
  );
  const dialogReturnTargets = new WeakMap<Element, FocusTarget>();
  function beforeDialogEnter(element: Element) {
    if (document.activeElement instanceof HTMLElement)
      dialogReturnTargets.set(element, focusTarget(document.activeElement)!);
  }
  function restoreDialogFocus(element: Element) {
    const previous = dialogReturnTargets.get(element);
    dialogReturnTargets.delete(element);
    if (overlayOpen.value || context.value) return;
    restorePageFocus(previous);
  }
  function restoreConfirmationFocus(element: Element) {
    const previous = dialogReturnTargets.get(element);
    dialogReturnTargets.delete(element);
    if (
      previous?.element.isConnected &&
      previous.element.closest('dialog[open]:not([inert])') &&
      !previous.element.matches(':disabled')
    )
      previous.element.focus({ preventScroll: true });
    else restorePageFocus(previous);
  }
  function beforeDialogLeave(element: Element) {
    (element as HTMLElement).inert = true;
  }

  function forgetDialogFocus(element: Element) {
    dialogReturnTargets.delete(element);
  }

  return {
    contextTarget,
    rememberContextTarget,
    closeContext,
    restorePageFocus,
    beforeDialogEnter,
    restoreDialogFocus,
    restoreConfirmationFocus,
    beforeDialogLeave,
    forgetDialogFocus,
  };
}
