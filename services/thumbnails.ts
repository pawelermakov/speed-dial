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
      port.onMessage.removeListener(message);
      port.onDisconnect.removeListener(disconnect);
      port.disconnect();
    };
    const message = (value: CaptureResponse) => {
      if (value.requestId !== request.requestId) return;
      cleanup(); resolve(value);
    };
    const disconnect = () => { cleanup(); reject(new Error('Фоновый захват прерван. Можно сохранить сайт без эскиза.')); };
    // Includes queue time; disconnect cancels a queued/active capture.
    const timer = setTimeout(() => {
      cleanup(); reject(new Error('Время ожидания захвата истекло. Можно сохранить сайт без эскиза.'));
    }, 45000);
    port.onMessage.addListener(message);
    port.onDisconnect.addListener(disconnect);
    port.postMessage(request);
  });
  if (response.error) throw new Error(response.error);
  const thumbnail = imageFromDataUrl(response.thumbnail, 'Эскиз');
  if (!thumbnail) throw new Error('Браузер не вернул эскиз.');
  return { title: response.title || new URL(request.url).hostname, favicon: response.favicon || '', thumbnail };
}
