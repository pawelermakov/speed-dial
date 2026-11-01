import type { browser as Browser } from 'wxt/browser';
import type { DialDatabase } from '../../common/infrastructure/database';
import { createLazyLoader } from '../../common/helpers/lazy';
import { message as messageText } from '../../common/i18n/messages';
import type { CaptureHandler } from './services/interfaces';
import type { CaptureRequest, CaptureResponse } from './entities/capture';
import { AutoNameStore } from './adapters/storage/autoNames';
import { createCaptureQueue } from './adapters/api/browserCapture';

export function New({
  browser,
  database: db,
  loadCapture = () => Promise.resolve(createCaptureQueue()),
}: {
  browser: typeof Browser;
  database: DialDatabase;
  loadCapture?: () => Promise<CaptureHandler>;
}) {
  const autoNames = new AutoNameStore(db);
  const capture = createLazyLoader(loadCapture);
  const connections = new Set<() => void>();
  let disposed = false;
  const changed: Parameters<typeof browser.bookmarks.onChanged.addListener>[0] = (id, change) => {
    void autoNames.invalidate(id, change).catch(() => {});
  };
  const removed: Parameters<typeof browser.bookmarks.onRemoved.addListener>[0] = (_id, info) => {
    const clean = (node: typeof info.node) => {
      void autoNames.delete(node.id).catch(() => {});
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
      const reply = (response: CaptureResponse) => {
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
    },
  };
}
