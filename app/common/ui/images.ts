import { message } from '../i18n/messages';
import { LocalizedError } from '../i18n/errors';
const maxImageBytes = 20 * 1024 * 1024;
export async function readImage(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(file.type) || file.size > maxImageBytes)
    throw new LocalizedError(message('images.validation.choose_raster'));
  const bitmap = await createImageBitmap(file);
  bitmap.close();
  return file.slice(0, file.size, file.type);
}
