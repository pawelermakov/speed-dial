import { message, errorMessage, LocalizedError } from './i18n';
import { browser } from 'wxt/browser';
import type { CaptureRequest, CaptureResponse } from '../types/models';
import { normalizeUrl, safeFavicon } from './validation';

const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(signal.reason); return; }
  const abort = () => { clearTimeout(timer); reject(signal.reason); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
  signal.addEventListener('abort', abort, { once: true });
});
export function createCaptureQueue() {
  let queue = Promise.resolve();
  let pending = 0;
  let lastCapture = 0;
  return (request: CaptureRequest, originTab: number, cancellation: AbortSignal): Promise<CaptureResponse> => {
    if (pending >= 8) return Promise.resolve({ requestId: request.requestId, error:message('capture.errors.queue_full') });
    pending++;
    const task = queue.then(async () => {
      const signal = AbortSignal.any([cancellation, AbortSignal.timeout(20000)]);
      let ownId: number | undefined;
      let windowId: number | undefined;
      let changed = false;
      let watching = false;
      const activated = (info: { tabId: number; windowId: number }) => {
        if (watching && info.windowId === windowId && info.tabId !== ownId) changed = true;
      };
      const updated = (id: number, info: { status?: string; url?: string }) => {
        if (watching && id === ownId && (info.status === 'loading' || info.url)) changed = true;
      };
      browser.tabs.onActivated.addListener(activated);
      browser.tabs.onUpdated.addListener(updated);
      try {
        signal.throwIfAborted();
        const url = normalizeUrl(request.url);
        const origin = await browser.tabs.get(originTab);
        if (!origin.active) throw new LocalizedError(message('capture.errors.return_to_tab'));
        windowId = origin.windowId;
        const tab = await browser.tabs.create({ url, active: true, windowId, openerTabId: originTab });
        ownId = tab.id;
        if (ownId === undefined) throw new LocalizedError(message('capture.errors.tab_not_created'));
        // Polling avoids leaked onUpdated listeners and the create/complete race.
        // Each API call also keeps the MV3 worker alive during the bounded task.
        let loaded = await browser.tabs.get(ownId);
        while (loaded.status !== 'complete' || !/^https?:\/\//i.test(loaded.url ?? '')) {
          await pause(150, signal);
          loaded = await browser.tabs.get(ownId);
        }
        signal.throwIfAborted();
        normalizeUrl(loaded.url);
        watching = true;
        await pause(Math.max(700, 650 - (Date.now() - lastCapture)), signal);
        const before = await browser.tabs.get(ownId);
        const active = await browser.tabs.query({ active: true, windowId });
        if (changed || before.status !== 'complete' || active[0]?.id !== ownId)
          throw new LocalizedError(message('capture.errors.active_tab_changed'));
        normalizeUrl(before.url);
        signal.throwIfAborted();
        lastCapture = Date.now();
        const thumbnail = await browser.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 80 });
        const after = await browser.tabs.get(ownId);
        const activeAfter = await browser.tabs.query({ active: true, windowId });
        signal.throwIfAborted();
        if (changed || activeAfter[0]?.id !== ownId || after.url !== before.url || after.status !== 'complete')
          throw new LocalizedError(message('capture.errors.tab_changed_during_capture'));
        let favicon = '';
        try { favicon = safeFavicon(after.favIconUrl); } catch { /* Unsupported site icon: keep the optional favicon empty. */ }
        return { requestId: request.requestId, title: after.title || new URL(url).hostname, favicon, thumbnail };
      } catch (error) {
        return { requestId: request.requestId, error: signal.aborted
          ? message('capture.errors.canceled_or_timed_out')
          : errorMessage(error) };
      } finally {
        watching = false;
        browser.tabs.onActivated.removeListener(activated);
        browser.tabs.onUpdated.removeListener(updated);
        if (ownId !== undefined) {
          // Only the tab ID returned by this operation's tabs.create can be closed.
          const active = await browser.tabs.query({ active: true, windowId }).catch(() => []);
          if (active[0]?.id === ownId) {
            await browser.tabs.update(originTab, { active: true }).catch(() => undefined);
          }
          await browser.tabs.remove(ownId).catch(() => undefined);
        }
      }
    });
    queue = task.then(() => undefined, () => undefined);
    return task.finally(() => { pending--; });
  };
}
