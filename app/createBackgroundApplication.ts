import { browser } from 'wxt/browser';
import { DialDatabase } from '../shared/infrastructure/database';
import { withDataLock } from '../shared/infrastructure/browser/dataLock';
import { createCaptureQueue } from '../services/capture';
import type { CaptureRequest } from '../modules/dial/modules/capture';
import { startSettingsSync } from '../services/syncBackground';
import { invalidateAutoName } from '../services/autoNames';

export function createBackgroundApplication() {
  const db = new DialDatabase();
  const sync = startSettingsSync(browser, withDataLock);
  const capture = createCaptureQueue();
  const connections = new Set<() => void>();
  let disposed = false;
  const changed: Parameters<typeof browser.bookmarks.onChanged.addListener>[0] = (id, change) => {
    void invalidateAutoName(db, id, change).catch(() => {});
  };
  const removed: Parameters<typeof browser.bookmarks.onRemoved.addListener>[0] = (_id, info) => {
    const clean = (node: typeof info.node) => {
      void db.autoNames.delete(node.id).catch(() => {});
      node.children?.forEach(clean);
    };
    clean(info.node);
  };
  const connected: Parameters<typeof browser.runtime.onConnect.addListener>[0] = (port) => {
    if (
      disposed ||
      port.name !== 'speed-dial-capture' ||
      port.sender?.id !== browser.runtime.id ||
      !port.sender.url?.startsWith(browser.runtime.getURL('/newtab.html'))
    )
      return;
    const cancellation = new AbortController();
    let received = false;
    const disconnect = () => {
      cancellation.abort();
      port.onDisconnect.removeListener(disconnect);
      port.onMessage.removeListener(onMessage);
      connections.delete(disconnect);
    };
    const onMessage = (message: unknown) => {
      if (disposed || cancellation.signal.aborted || !message || typeof message !== 'object')
        return;
      const request = message as CaptureRequest;
      if (
        received ||
        request.type !== 'capture' ||
        typeof request.requestId !== 'string' ||
        request.requestId.length > 100 ||
        typeof request.url !== 'string' ||
        port.sender?.tab?.id === undefined
      )
        return;
      received = true;
      void capture(request, port.sender.tab.id, cancellation.signal).then((response) => {
        if (!cancellation.signal.aborted) {
          try {
            port.postMessage(response);
          } catch {
            disconnect();
          }
        }
      });
    };
    connections.add(disconnect);
    port.onDisconnect.addListener(disconnect);
    port.onMessage.addListener(onMessage);
  };
  browser.bookmarks.onChanged.addListener(changed);
  browser.bookmarks.onRemoved.addListener(removed);
  browser.runtime.onConnect.addListener(connected);
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      browser.bookmarks.onChanged.removeListener(changed);
      browser.bookmarks.onRemoved.removeListener(removed);
      browser.runtime.onConnect.removeListener(connected);
      for (const disconnect of [...connections]) disconnect();
      sync.dispose();
      db.close();
    },
  };
}
