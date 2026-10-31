import { message, LocalizedError } from '../../../../../services/i18n';
import { browser } from 'wxt/browser';
import type { CaptureRequest, CaptureResponse } from '../entities/models';
import { imageFromDataUrl } from '../../../../../services/images';
import { normalizeUrl } from '../../../../../services/validation';

import type { CaptureClient } from '../services/interfaces';
export function createCaptureClient(): CaptureClient {
  const cancellations = new Set<() => void>();
  let disposed = false;
  async function requestThumbnail(
    url: string,
  ): Promise<{ title: string; favicon: string; thumbnail: Blob }> {
    if (disposed) throw new LocalizedError(message('capture.errors.background_interrupted'));
    const request: CaptureRequest = {
      type: 'capture',
      requestId: crypto.randomUUID(),
      url: normalizeUrl(url),
    };
    const response = await new Promise<CaptureResponse>((resolve, reject) => {
      const port = browser.runtime.connect({ name: 'speed-dial-capture' });
      let settled = false;
      const cleanup = () => {
        cancellations.delete(cancel);
        clearTimeout(timer);
        port.onMessage.removeListener(onMessage);
        port.onDisconnect.removeListener(disconnect);
        try {
          port.disconnect();
        } catch {
          /* The peer may already have disconnected. */
        }
      };
      const onMessage = (value: CaptureResponse) => {
        if (settled || !value || value.requestId !== request.requestId) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const disconnect = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new LocalizedError(message('capture.errors.background_interrupted')));
      };
      // Includes queue time; disconnect cancels a queued/active capture.
      const cancel = () => disconnect();
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new LocalizedError(message('capture.errors.timeout_without_thumbnail')));
      }, 45000);
      cancellations.add(cancel);
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(disconnect);
      try {
        port.postMessage(request);
      } catch (error) {
        settled = true;
        cleanup();
        reject(error);
      }
    });
    if (response.error) throw new LocalizedError(response.error);
    const thumbnail = imageFromDataUrl(response.thumbnail, message('thumbnails.label'));
    if (!thumbnail) throw new LocalizedError(message('capture.errors.thumbnail_missing'));
    return {
      title: response.title || new URL(request.url).hostname,
      favicon: response.favicon || '',
      thumbnail,
    };
  }

  return {
    requestThumbnail,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cancel of [...cancellations]) cancel();
    },
  };
}
