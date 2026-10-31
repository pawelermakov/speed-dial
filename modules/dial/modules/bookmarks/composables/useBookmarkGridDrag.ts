import { ref, watch, onUnmounted, type Ref } from 'vue';
import { insertedOrder, nearestInsertion } from '../../../../../utils/reorder';
import type { BookmarkGridProps } from './gridTypes';
export function useBookmarkGridDrag(
  props: BookmarkGridProps,
  grid: Ref<HTMLElement | undefined>,
  cancelReveal: () => void,
  emit: {
    (event: 'refresh'): void;
    (event: 'reorder', ids: string[], expected: string[], revision: number): void;
  },
) {
  const dragId = ref<string | null>(null),
    overId = ref<string | null>(null),
    after = ref(false);
  let expected: string[] = [],
    suppressClick = false,
    dragRevision = 0;
  let clickResetTimer: ReturnType<typeof setTimeout> | undefined;
  function start(event: DragEvent, id: string) {
    if (props.disabled || props.searching) {
      event.preventDefault();
      return;
    }
    cancelReveal();
    clearTimeout(clickResetTimer);
    dragId.value = id;
    dragRevision = props.revision ?? 0;
    expected = props.tabs.map((row) => row.id);
    suppressClick = true;
    event.dataTransfer?.setData('text/plain', String(id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  function finish() {
    dragId.value = null;
    overId.value = null;
  }
  function end() {
    const cancelled = !!dragId.value;
    finish();
    if (cancelled) emit('refresh');
    clearTimeout(clickResetTimer);
    clickResetTimer = setTimeout(() => {
      suppressClick = false;
    }, 100);
  }
  watch(
    () => [props.disabled, props.searching, props.revision],
    () => {
      if (dragId.value) end();
    },
  );
  function over(event: DragEvent, id: string) {
    if (!dragId.value || props.disabled || props.searching) return;
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    after.value = event.clientX > rect.left + rect.width / 2;
    overId.value = insertedOrder(expected, dragId.value, id, after.value) ? id : null;
  }
  function drop(event: DragEvent, target: string) {
    if (!dragId.value || props.disabled || props.searching) {
      finish();
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const ids = insertedOrder(
      expected,
      dragId.value,
      target,
      event.clientX > rect.left + rect.width / 2,
    );
    finish();
    if (ids && dragRevision === (props.revision ?? 0)) emit('reorder', ids, expected, dragRevision);
  }
  function gridTarget(event: DragEvent) {
    return nearestInsertion(
      Array.from(grid.value?.querySelectorAll<HTMLElement>('.bookmark') ?? []).map((el) => ({
        id: el.dataset.bookmarkId!,
        ...el.getBoundingClientRect().toJSON(),
      })),
      event.clientX,
      event.clientY,
    );
  }
  function overGrid(event: DragEvent) {
    if (
      !dragId.value ||
      props.disabled ||
      props.searching ||
      (event.target as Element).closest('.bookmark')
    )
      return;
    event.preventDefault();
    const target = gridTarget(event);
    overId.value =
      target && insertedOrder(expected, dragId.value, target.id, target.after) ? target.id : null;
    if (target) after.value = target.after;
  }
  function dropGrid(event: DragEvent) {
    if (!dragId.value || props.disabled || props.searching) return;
    const target = gridTarget(event),
      ids = target && insertedOrder(expected, dragId.value, target.id, target.after);
    finish();
    if (ids && dragRevision === (props.revision ?? 0)) emit('reorder', ids, expected, dragRevision);
  }
  function click(event: MouseEvent) {
    if (suppressClick) {
      event.preventDefault();
      suppressClick = false;
    }
  }

  onUnmounted(() => clearTimeout(clickResetTimer));

  return { dragId, overId, after, start, end, over, drop, overGrid, dropGrid, click };
}
