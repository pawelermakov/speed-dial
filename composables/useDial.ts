import { ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { db } from '../services/database';
import { settingsItem } from '../services/settings';
import { Repository, withDataLock } from '../services/repository';
import { defaults, searchProviderIds, type SearchProviderId, type Snapshot } from '../types/models';
import { faviconBlob } from '../services/favicons';
const rootItem = storage.defineItem<string>('local:rootFolderId');
export const repository = new Repository(db, settingsItem, browser.bookmarks, rootItem);
export function useDial() {
  const snapshot = shallowRef<Snapshot>({ tabs: [], categories: [], rootId: null, activeId: null, settings: { ...defaults }, background: null });
  const loading = ref(true), busy = ref(false), notice = ref('');
  const revision = ref(0);
  const channel = new BroadcastChannel('speed-dial-updates');
  let generation = 0, timer: ReturnType<typeof setTimeout> | undefined, disposed = false;
  const attempted = new Set<string>();
  const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
  const refresh = async () => {
    const sequence = ++generation;
    const next = await withDataLock(() => repository.load());
    if (sequence !== generation || disposed) return;
    snapshot.value = next;
    if (next.rootNotice) { notice.value = next.rootNotice; repository.clearSourceNotice?.(); }
    for (const tab of next.tabs.filter(tab => !tab.favicon)) {
      const key = tab.id + tab.url;
      if (attempted.has(key)) continue; attempted.add(key);
      void faviconBlob(tab.url).then(async blob => {
        if (!blob || disposed) return;
        await repository.cache(tab.id, tab.url, 'favicon', blob);
        schedule(); channel.postMessage('updated');
      }).catch(() => {});
    }
  };
  const schedule = () => { generation++; revision.value++; clearTimeout(timer); timer = setTimeout(() => { void refresh().catch(error => { notice.value = errorText(error); }); }, 60); };
  const run = async (operation: () => Promise<unknown>): Promise<boolean> => {
    if (busy.value || loading.value) return false;
    busy.value = true;
    try { await withDataLock(operation); await refresh(); channel.postMessage('updated'); return true; }
    catch (error) { notice.value = errorText(error); await refresh().catch(() => {}); return false; }
    finally { busy.value = false; }
  };
  const updateSearchProvider = (searchProvider: SearchProviderId) => {
    snapshot.value = { ...snapshot.value, settings: { ...snapshot.value.settings, searchProvider } };
  };
  const changeSearchProvider = async (searchProvider: SearchProviderId): Promise<boolean> => {
    if (busy.value || loading.value) return false;
    try {
      await withDataLock(() => repository.saveSearchProvider(searchProvider));
      if (disposed) return false;
      updateSearchProvider(searchProvider);
      channel.postMessage({ type: 'search-provider', provider: searchProvider });
      return true;
    } catch (error) { notice.value = errorText(error); return false; }
  };
  channel.onmessage = event => {
    if (event.data?.type === 'search-provider' && searchProviderIds.includes(event.data.provider)) {
      updateSearchProvider(event.data.provider);
    } else schedule();
  };
  const unwatchRoot = rootItem.watch(async id => {
    if (disposed || id === repository.rootId) return;
    try {
      const changed = await withDataLock(async () => {
        if (disposed || id === repository.rootId) return false;
        generation++;
        await repository.adoptRoot(id);
        return true;
      });
      if (changed) schedule();
    } catch (error) { notice.value = errorText(error); schedule(); }
  });
  const api = browser.bookmarks;
  const events = [api?.onCreated, api?.onRemoved, api?.onChanged, api?.onMoved, api?.onChildrenReordered, api?.onImportEnded];
  const bookmarkEvent = () => { attempted.clear(); schedule(); };
  const tabUpdated = (_id: number, change: { favIconUrl?: string }) => { if (change.favIconUrl) { attempted.clear(); schedule(); } };
  events.forEach(event => event?.addListener(bookmarkEvent));
  browser.tabs?.onUpdated?.addListener(tabUpdated);
  onMounted(async () => {
    try {
      if (!api) throw new Error('Bookmarks API недоступен. Проверьте разрешение «Закладки» и переустановите расширение.');
      const initial = await withDataLock(() => repository.initialize());
      if (initial?.rootNotice) notice.value = initial.rootNotice;
      await refresh();
    } catch (error) { notice.value = 'Не удалось открыть закладки. Проверьте разрешение расширения. ' + errorText(error); }
    finally { loading.value = false; }
  });
  onUnmounted(() => { unwatchRoot(); disposed = true; generation++; clearTimeout(timer); events.forEach(event => event?.removeListener(bookmarkEvent)); browser.tabs?.onUpdated?.removeListener(tabUpdated); channel.close(); });
  const announce = () => channel.postMessage('updated');
  return { snapshot, loading, busy, notice, run, refresh, announce, revision, changeSearchProvider };
}
