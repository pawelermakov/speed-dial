import { ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { db } from '../services/database';
import { settingsItem } from '../services/settings';
import { Repository, withDataLock } from '../services/repository';
import { defaults, type Snapshot } from '../types/models';

export const repository = new Repository(db, settingsItem);
export function useDial() {
  const snapshot = shallowRef<Snapshot>({ tabs: [], settings: { ...defaults }, background: null });
  const loading = ref(true);
  const busy = ref(false);
  const notice = ref('');
  const channel = new BroadcastChannel('speed-dial-updates');
  const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
  const refresh = async () => { snapshot.value = await withDataLock(() => repository.load()); };
  const run = async (operation: () => Promise<unknown>): Promise<boolean> => {
    if (busy.value || loading.value) return false;
    busy.value = true;
    try {
      await withDataLock(async () => { await repository.recover(); await operation(); snapshot.value = await repository.load(); });
      channel.postMessage('updated');
      return true;
    } catch (error) { notice.value = errorText(error); return false; }
    finally { busy.value = false; }
  };
  channel.onmessage = () => { void refresh().catch(error => { notice.value = errorText(error); }); };
  onMounted(async () => {
    try { snapshot.value = await withDataLock(() => repository.initialize(window.localStorage)); }
    catch (error) {
      notice.value = errorText(error);
      try { snapshot.value = await withDataLock(() => repository.load()); } catch { /* The original data remains untouched. */ }
    }
    finally { loading.value = false; }
  });
  onUnmounted(() => channel.close());
  return { snapshot, loading, busy, notice, run, refresh };
}
