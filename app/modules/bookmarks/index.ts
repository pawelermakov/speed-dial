import type { DialDatabase } from '../../common/infrastructure/database';
import type { DataLock } from '../../common/infrastructure/browser/interfaces';
import { BookmarkAssetStore } from './adapters/storage/assets';
import { AutoNameStore } from './adapters/storage/autoNames';
import { nativeMoveIndex } from './adapters/api/moveIndex';
import { BookmarksApi } from './adapters/api';
import { BookmarksSource } from './services/source';
import { BookmarkActions } from './services/actions';
import type { BookmarksPort, BookmarkPresentation } from './services/interfaces';
import { BookmarksService } from './services';
import { BookmarksDataService } from './services/data';
import { RootStorage } from './adapters/storage';
import type { BrowserStorage } from '../../common/infrastructure/browser/storage';
import { normalizeUrl } from '../../common/helpers/url';
import { LocalizedError } from '../../common/i18n/errors';
export function New(dependencies: {
  database: DialDatabase;
  bookmarks: BookmarksPort;
  storage: BrowserStorage;
  presentation: BookmarkPresentation;
  lock: DataLock;
}) {
  const { database, presentation, lock } = dependencies;
  const root = new RootStorage(dependencies.storage);
  const faviconBlob = async (url: string, hint: string | undefined, signal: AbortSignal) => {
    const api = await import('./adapters/api/favicons');
    return api.faviconBlob(url, hint, signal);
  };
  const bookmarks = new BookmarksApi(dependencies.bookmarks);
  const assets = new BookmarkAssetStore(database),
    autoNames = new AutoNameStore(database);
  const source = new BookmarksSource(bookmarks, root, assets, presentation);
  const actions = new BookmarkActions({
    source,
    api: bookmarks,
    assets,
    metadata: autoNames,
    presentation,
    normalizeUrl,
    lock,
    moveIndex: nativeMoveIndex,
  });
  return new BookmarksService(
    source,
    actions,
    new BookmarksDataService(bookmarks, assets, autoNames),
    {
      faviconBlob,
      async loadCapture(faviconBlob) {
        const [{ BookmarkCaptureService }, { createCaptureClient }] = await Promise.all([
          import('./services/capture'),
          import('./adapters/api/captureClient'),
        ]);
        return new BookmarkCaptureService({
          source,
          actions,
          client: createCaptureClient(),
          faviconBlob,
          error: (message) => new LocalizedError(message),
        });
      },
    },
  );
}
export { insertedOrder } from './helpers/reorder';

export * from './entities';
export * from './services';
