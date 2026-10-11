import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { createCaptureQueue } from '../services/capture';
import type { CaptureRequest } from '../types/models';

export default defineBackground(() => {
  const capture = createCaptureQueue();
  browser.runtime.onConnect.addListener(port => {
    if (port.name !== 'speed-dial-capture' || port.sender?.id !== browser.runtime.id ||
      !port.sender.url?.startsWith(browser.runtime.getURL('/newtab.html'))) return;
    const cancellation = new AbortController();
    let received = false;
    port.onDisconnect.addListener(() => cancellation.abort());
    port.onMessage.addListener((message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const request = message as CaptureRequest;
      if (received || request.type !== 'capture' || typeof request.requestId !== 'string' ||
        request.requestId.length > 100 || typeof request.url !== 'string' || port.sender?.tab?.id === undefined) return;
      received = true;
      void capture(request, port.sender.tab.id, cancellation.signal).then(response => {
        if (!cancellation.signal.aborted) {
          try { port.postMessage(response); } catch { cancellation.abort(); }
        }
      });
    });
  });
});
