import { faviconTileColor } from '../utils/tile';

export async function readFaviconColor(blob: Blob): Promise<string | undefined> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') throw new Error('Image decoder unavailable');
  const imageUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(image, 0, 0, 32, 32);
    return faviconTileColor(context.getImageData(0, 0, 32, 32).data);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'EncodingError') return undefined;
    throw error;
  }
  finally { URL.revokeObjectURL(imageUrl); }
}
