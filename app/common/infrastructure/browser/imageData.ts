import { message } from '../../i18n/messages';
import { LocalizedError } from '../../i18n/errors';
export function blobToDataUrl(blob: Blob | null): Promise<string> {
  if (!blob) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new LocalizedError(message('images.errors.read_failed')));
    reader.readAsDataURL(blob);
  });
}
