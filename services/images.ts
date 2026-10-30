import { message, LocalizedError, type MessageText } from './i18n';
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
export function blobToDataUrl(blob: Blob | null): Promise<string> {
  if (!blob) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new LocalizedError(message('images.errors.read_failed')));
    reader.readAsDataURL(blob);
  });
}
export async function readImage(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(file.type) || file.size > maxImageBytes)
    throw new LocalizedError(message('images.validation.choose_raster'));
  const bitmap = await createImageBitmap(file);
  bitmap.close();
  return file.slice(0, file.size, file.type);
}
