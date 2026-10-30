import type { DialDatabase } from '../../../../shared/infrastructure/database';
import type { DataLock } from '../../../../shared/infrastructure/browser/interfaces';
import { BookmarkAssetStore } from './adapters/assets';
import { AutoNameStore } from './adapters/autoNames';
import { nativeMoveIndex } from './adapters/moveIndex';
import { BookmarksSource } from './services/source';
import { BookmarkActions } from './services/actions';
import type { BookmarksPort, RootPort, BookmarkPresentation } from './services/interfaces';
export function createBookmarksModule(dependencies: {
  database: DialDatabase;
  bookmarks: BookmarksPort;
  root: RootPort;
  presentation: BookmarkPresentation;
  normalizeUrl: (value: unknown) => string;
  lock: DataLock;
}) {
  const { database, bookmarks, root, presentation, normalizeUrl, lock } = dependencies;
  const assets = new BookmarkAssetStore(database),
    autoNames = new AutoNameStore(database);
  const source = new BookmarksSource(bookmarks, root, assets, presentation);
  const actions = new BookmarkActions(
    source,
    bookmarks,
    assets,
    autoNames,
    presentation,
    normalizeUrl,
    lock,
    nativeMoveIndex,
  );
  return { source, actions, assets, autoNames, bookmarks };
}
export type BookmarksModule = ReturnType<typeof createBookmarksModule>;
