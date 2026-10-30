import type { browser } from 'wxt/browser';
import type { DialEventsPort } from '../services/application';

export function createBrowserEvents(api: typeof browser): DialEventsPort {
  const cleanups = new Set<() => void>();
  let disposed = false;
  return {
    available: !!api.bookmarks,
    subscribe(listener) {
      if (disposed) return () => {};
      const bookmarks = api.bookmarks;
      const events = [
        bookmarks?.onCreated,
        bookmarks?.onRemoved,
        bookmarks?.onChanged,
        bookmarks?.onMoved,
        bookmarks?.onChildrenReordered,
        bookmarks?.onImportEnded,
      ];
      const changed = () => listener(false);
      const tabUpdated = (_id: number, change: { favIconUrl?: string }) => {
        if (change.favIconUrl) listener(true);
      };
      events.forEach((event) => event?.addListener(changed));
      api.tabs?.onUpdated?.addListener(tabUpdated);
      const cleanup = () => {
        events.forEach((event) => event?.removeListener(changed));
        api.tabs?.onUpdated?.removeListener(tabUpdated);
        cleanups.delete(cleanup);
      };
      cleanups.add(cleanup);
      return cleanup;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of [...cleanups]) cleanup();
    },
  };
}
