import { browser } from 'wxt/browser';
import { DialDatabase } from '../shared/infrastructure/database';
import { withDataLock } from '../shared/infrastructure/browser/dataLock';
import { createLazyLoader } from '../shared/helpers/lazy';
import { message as messageText } from '../shared/i18n/messages';
import type { CaptureHandler } from '../modules/dial/modules/capture';
import type { CaptureRequest } from '../modules/dial/modules/capture';
import { createCaptureQueue } from '../modules/dial/modules/capture/adapters/browserCapture';
import { startSettingsSync } from '../modules/dial/modules/sync/adapters/background';
import { AutoNameStore } from '../modules/dial/modules/bookmarks/adapters/autoNames';

export function createBackgroundApplication(
  // Background is a single MV3-compatible bundle. Defer the queue factory,
  // while newtab can fetch its optional UI/client chunks on demand.
  loadCapture: () => Promise<CaptureHandler> = () => Promise.resolve(createCaptureQueue()),
) {
  const db = new DialDatabase();
  const autoNames = new AutoNameStore(db);
  const sync = startSettingsSync(browser, withDataLock);
  const capture = createLazyLoader(loadCapture);
  const connections = new Set<() => void>();
  let disposed = false;
  const changed: Parameters<typeof browser.bookmarks.onChanged.addListener>[0] = (id, change) => {
    void autoNames.invalidate(id, change).catch(() => {});
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
      const originTab = port.sender.tab.id;
      const reply = (response: import('../modules/dial/modules/capture').CaptureResponse) => {
        if (!cancellation.signal.aborted && !disposed) {
          try {
            port.postMessage(response);
          } catch {
            disconnect();
          }
        }
      };
      void capture
        .get()
        .then(async (execute) => {
          if (cancellation.signal.aborted || disposed) return;
          reply(await execute(request, originTab, cancellation.signal));
        })
        .catch(() => {
          reply({
            requestId: request.requestId,
            error: messageText('capture.errors.background_interrupted'),
          });
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
      capture.dispose();
      sync.dispose();
      db.close();
    },
  };
}
