import { message } from '../i18n/messages';
import { LocalizedError } from '../i18n/errors';
import type { MessageText } from '../i18n/contracts';
const maxImageBytes = 20 * 1024 * 1024;
export function imageFromDataUrl(
  value: unknown,
  label: MessageText = message('images.label'),
): Blob | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string')
    throw new LocalizedError(message('images.validation.data_url_required', { field_name: label }));
  const match =
    /^data:(image\/(?:png|jpeg|webp|gif|bmp|avif|x-icon));base64,([a-z\d+/=\s]+)$/i.exec(value);
  if (!match || value.length > maxImageBytes * 1.4)
    throw new LocalizedError(
      message('images.validation.raster_data_url_required', { field_name: label }),
    );
  let binary: string;
  try {
    binary = atob(match[2]!);
  } catch {
    throw new LocalizedError(
      message('images.validation.invalid_base64_named', { field_name: label }),
    );
  }
  if (binary.length > maxImageBytes)
    throw new LocalizedError(
      message('images.validation.file_too_large_named', { field_name: label }),
    );
  return new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], { type: match[1]! });
}
