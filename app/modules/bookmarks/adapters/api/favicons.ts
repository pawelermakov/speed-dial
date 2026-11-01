import { browser } from 'wxt/browser';
import { imageFromDataUrl } from '../../../../common/helpers/imageData';
import { normalizeUrl } from '../../../../common/helpers/url';
let chromePlaceholder: Promise<Uint8Array | null> | undefined;
const endpoint = (url: string) => {
  const source = new URL('/_favicon/', browser.runtime.getURL('/newtab.html'));
  source.searchParams.set('pageUrl', url);
  source.searchParams.set('size', '32');
  return source.href;
};
async function fetchBlob(source: string, cancellation?: AbortSignal): Promise<Blob | null> {
  const timeout = AbortSignal.timeout(5000);
  const signal = cancellation ? AbortSignal.any([cancellation, timeout]) : timeout;
  const response = await fetch(source, { credentials: 'omit', signal });
  if (!response.ok) return null;
  const blob = await response.blob();
  return blob.size <= 1024 * 1024 ? blob : null;
}
async function siteIcon(
  url: string,
  hint?: string,
  cancellation?: AbortSignal,
): Promise<Blob | null> {
  if (hint?.startsWith('data:')) return imageFromDataUrl(hint, 'Favicon');
  const origin = new URL(url).origin;
  if (hint) {
    const source = normalizeUrl(hint);
    if (new URL(source).origin !== origin) return null;
    return fetchBlob(source, cancellation);
  }
  // An unvisited site often has no entry in Chrome's local favicon database.
  return fetchBlob(new URL('/favicon.ico', origin).href, cancellation);
}
export async function faviconBlob(
  url: string,
  hint?: string,
  cancellation?: AbortSignal,
): Promise<Blob | null> {
  try {
    cancellation?.throwIfAborted();
    let blob: Blob | null;
    if (import.meta.env.BROWSER !== 'firefox') {
      url = normalizeUrl(url);
      blob = await fetchBlob(endpoint(url), cancellation).catch(() => null);
      cancellation?.throwIfAborted();
      const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : new Uint8Array();
      // Chrome's internal endpoint returns PNG bytes without a Content-Type.
      if (blob && !blob.type) {
        blob = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
          ? blob.slice(0, blob.size, 'image/png')
          : null;
      }
      chromePlaceholder ??= fetchBlob(endpoint('https://' + crypto.randomUUID() + '.invalid/'))
        .then(async (value) => (value ? new Uint8Array(await value.arrayBuffer()) : null))
        .catch(() => null);
      const placeholder = await chromePlaceholder;
      cancellation?.throwIfAborted();
      if (
        placeholder &&
        bytes.length === placeholder.length &&
        bytes.every((value, index) => value === placeholder[index])
      )
        blob = null;
      if (!blob) blob = await siteIcon(url, hint, cancellation);
    } else {
      const value =
        hint || (await browser.tabs.query({})).find((tab) => tab.url === url)?.favIconUrl;
      if (!value) blob = await siteIcon(normalizeUrl(url), undefined, cancellation);
      else if (value.startsWith('data:')) blob = imageFromDataUrl(value, 'Favicon');
      else {
        const source = normalizeUrl(value);
        if (new URL(source).origin !== new URL(url).origin) return null;
        blob = await fetchBlob(source, cancellation);
      }
    }
    if (
      !blob ||
      blob.size > 1024 * 1024 ||
      !/^image\/(png|jpeg|webp|gif|bmp|avif|x-icon|vnd.microsoft.icon)$/.test(blob.type)
    )
      return null;
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
    return blob;
  } catch {
    cancellation?.throwIfAborted();
    return null;
  }
}
