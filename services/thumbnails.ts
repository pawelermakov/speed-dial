import { message, LocalizedError } from './i18n';
import { browser } from 'wxt/browser';
import type { CaptureRequest, CaptureResponse } from '../types/models';
import { imageFromDataUrl } from './images';
import { normalizeUrl } from './validation';

export async function requestThumbnail(url: string): Promise<{ title: string; favicon: string; thumbnail: Blob }> {
  const request: CaptureRequest = { type: 'capture', requestId: crypto.randomUUID(), url: normalizeUrl(url) };
  const response = await new Promise<CaptureResponse>((resolve, reject) => {
    const port = browser.runtime.connect({ name: 'speed-dial-capture' });
    const cleanup = () => {
      clearTimeout(timer);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(disconnect);
      port.disconnect();
    };
    const onMessage = (value: CaptureResponse) => {
      if (value.requestId !== request.requestId) return;
      cleanup(); resolve(value);
    };
    const disconnect = () => { cleanup(); reject(new LocalizedError(message('capture.errors.background_interrupted'))); };
    // Includes queue time; disconnect cancels a queued/active capture.
    const timer = setTimeout(() => {
      cleanup(); reject(new LocalizedError(message('capture.errors.timeout_without_thumbnail')));
    }, 45000);
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(disconnect);
    port.postMessage(request);
  });
  if (response.error) throw new LocalizedError(response.error);
  const thumbnail = imageFromDataUrl(response.thumbnail, message('thumbnails.label'));
  if (!thumbnail) throw new LocalizedError(message('capture.errors.thumbnail_missing'));
  return { title: response.title || new URL(request.url).hostname, favicon: response.favicon || '', thumbnail };
}
