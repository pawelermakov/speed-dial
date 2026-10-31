// Compatibility client; new applications load and own capture/newtab.
import { createCaptureClient } from '../modules/dial/modules/capture/adapters/client';
export { createCaptureClient };
export async function requestThumbnail(url: string) {
  const client = createCaptureClient();
  try {
    return await client.requestThumbnail(url);
  } finally {
    client.dispose();
  }
}
