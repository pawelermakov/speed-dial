const maxImageBytes = 20 * 1024 * 1024;
export function imageFromDataUrl(value: unknown, label = 'Изображение'): Blob | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(label + ': ожидается data URL.');
  const match = /^data:(image\/(?:png|jpeg|webp|gif|bmp|avif|x-icon));base64,([a-z\d+/=\s]+)$/i.exec(value);
  if (!match || value.length > maxImageBytes * 1.4) throw new Error(label + ': нужен растровый data URL до 20 МБ.');
  let binary: string;
  try { binary = atob(match[2]!); } catch { throw new Error(label + ': повреждён base64.'); }
  if (binary.length > maxImageBytes) throw new Error(label + ': файл больше 20 МБ.');
  return new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: match[1]! });
}
export function blobToDataUrl(blob: Blob | null): Promise<string> {
  if (!blob) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
    reader.readAsDataURL(blob);
  });
}
export async function readImage(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(file.type) || file.size > maxImageBytes)
    throw new Error('Выберите растровое изображение до 20 МБ.');
  const bitmap = await createImageBitmap(file);
  bitmap.close();
  return file.slice(0, file.size, file.type);
}
