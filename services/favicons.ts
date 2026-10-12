import { browser } from 'wxt/browser';
import { imageFromDataUrl } from './images';
import { normalizeUrl } from './validation';
let chromePlaceholder: Promise<Uint8Array | null> | undefined;
const endpoint = (url: string) => {
  const source = new URL('/_favicon/', browser.runtime.getURL('/newtab.html'));
  source.searchParams.set('pageUrl', url); source.searchParams.set('size', '32');
  return source.href;
};
async function fetchBlob(source: string): Promise<Blob | null> {
  const response = await fetch(source, { credentials: 'omit', signal: AbortSignal.timeout(5000) });
  if (!response.ok) return null;
  const blob = await response.blob();
  return blob.size <= 1024 * 1024 ? blob : null;
}
export async function faviconBlob(url: string, hint?: string): Promise<Blob | null> {
  try {
    let blob: Blob | null;
    if (import.meta.env.BROWSER !== 'firefox') {
      blob = await fetchBlob(endpoint(normalizeUrl(url)));
      if (!blob) return null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      // Chrome's internal endpoint returns PNG bytes without a Content-Type.
      if (!blob.type) {
        if (![137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) return null;
        blob = blob.slice(0, blob.size, 'image/png');
      }
      chromePlaceholder ??= fetchBlob(endpoint('https://' + crypto.randomUUID() + '.invalid/')).then(async value => value ? new Uint8Array(await value.arrayBuffer()) : null).catch(() => null);
      const placeholder = await chromePlaceholder;
      if (placeholder && bytes.length === placeholder.length && bytes.every((value,index) => value === placeholder[index])) return null;
    } else {
      const value = hint || (await browser.tabs.query({})).find(tab => tab.url === url)?.favIconUrl;
      if (!value) return null;
      if (value.startsWith('data:')) blob = imageFromDataUrl(value, 'Favicon');
      else {
        const source = normalizeUrl(value);
        if (new URL(source).origin !== new URL(url).origin) return null;
        blob = await fetchBlob(source);
      }
    }
    if (!blob || blob.size > 1024 * 1024 || !/^image\/(png|jpeg|webp|gif|bmp|avif|x-icon|vnd.microsoft.icon)$/.test(blob.type)) return null;
    const bitmap = await createImageBitmap(blob); bitmap.close(); return blob;
  } catch { return null; }
}
