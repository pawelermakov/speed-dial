import { createCaptureClient } from './adapters/client';
import { updateBookmarkImages } from './services/workflow';
import type {
  CaptureBookmarksPort,
  CaptureCompletion,
  PreparedCapture,
} from './services/interfaces';
export function createCaptureModule(ports: {
  bookmarks: CaptureBookmarksPort;
  faviconBlob(url: string, hint?: string): Promise<Blob | null>;
}) {
  const client = createCaptureClient();
  let disposed = false;
  return {
    updateImages(
      id: string,
      url: string,
      prepared: PreparedCapture,
      completion: CaptureCompletion,
    ) {
      return updateBookmarkImages(
        { ...ports, ...completion, request: client.requestThumbnail, active: () => !disposed },
        id,
        url,
        prepared,
      );
    },
    dispose() {
      disposed = true;
      client.dispose();
    },
  };
}
