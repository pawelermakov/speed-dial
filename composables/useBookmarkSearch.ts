import { ref, shallowRef, watch, onUnmounted, type Ref } from 'vue';
import type { Bookmark, Snapshot } from '../types/models';
import type { Repository } from '../services/repository';

export function useBookmarkSearch(repository: Repository, snapshot: Ref<Snapshot>, revision: Ref<number> = ref(0)) {
  const query = ref(''), results = shallowRef<Bookmark[]>([]), pending = ref(false), error = ref('');
  let generation = 0;
  const stop = watch([query, snapshot, revision], async () => {
    const current = ++generation;
    results.value = []; error.value = '';
    const text = query.value.trim();
    pending.value = !!text && !!snapshot.value.rootId;
    if (!pending.value) return;
    try {
      const next = await repository.search(text);
      if (current === generation) results.value = next;
    } catch (cause) {
      if (current === generation) error.value = 'Не удалось найти закладки. ' + (cause instanceof Error ? cause.message : String(cause));
    } finally { if (current === generation) pending.value = false; }
  }, { flush: 'sync' });
  onUnmounted(() => { generation++; stop(); });
  return { query, results, pending, error };
}
