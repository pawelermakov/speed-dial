import type { DialUpdate, UpdatesPort } from '../services/interfaces';

export function createUpdatesChannel(): UpdatesPort {
  const channel = new BroadcastChannel('speed-dial-updates');
  const listeners = new Set<(message: DialUpdate) => void>();
  let disposed = false;
  channel.onmessage = (event) => {
    const data: unknown = event.data;
    if (
      data === 'updated' ||
      (data && typeof data === 'object' && 'type' in data && data.type === 'updated')
    ) {
      for (const listener of listeners) listener(data as DialUpdate);
    }
  };
  return {
    publish(message) {
      if (!disposed) channel.postMessage(message);
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      channel.onmessage = null;
      channel.close();
    },
  };
}
