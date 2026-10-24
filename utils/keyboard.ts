/** Horizontal movement stays in its row; vertical movement clamps to a short
 * final row. Use the rendered responsive column count, not the saved limit. */
export function gridFocusIndex(index: number, count: number, columns: number, key: string): number {
  if (!count) return -1;
  index = Math.max(0, Math.min(index, count - 1));
  columns = Math.max(1, Math.floor(columns));
  const start = Math.floor(index / columns) * columns;
  const end = Math.min(start + columns - 1, count - 1);
  switch (key) {
    case 'ArrowLeft': return Math.max(start, index - 1);
    case 'ArrowRight': return Math.min(end, index + 1);
    case 'ArrowUp': return start ? index - columns : index;
    case 'ArrowDown': return start + columns < count ? Math.min(index + columns, count - 1) : index;
    case 'Home': return start;
    case 'End': return end;
    default: return index;
  }
}
export function contextKey(event: KeyboardEvent): boolean {
  return !event.isComposing && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'));
}
export function plainNavigation(event: KeyboardEvent): boolean {
  return !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

export function cycleDialogFocus(event: KeyboardEvent, dialog?: HTMLElement) {
  if (event.key !== 'Tab' || !dialog || event.isComposing) return;
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]'))
    .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
