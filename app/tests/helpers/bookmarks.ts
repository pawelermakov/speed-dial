import type { DialDatabase } from '../../common/infrastructure/database';
import type { DataLock } from '../../common/infrastructure/browser/interfaces';
import type { BrowserStorage } from '../../common/infrastructure/browser/storage';
import {
  New,
  type BookmarksPort,
  type RootPort,
  type BookmarkPresentation,
} from '../../modules/bookmarks';

export function createBookmarksModule(dependencies: {
  database: DialDatabase;
  bookmarks: BookmarksPort;
  root: RootPort;
  lock: DataLock;
  presentation: BookmarkPresentation;
}) {
  const { root, ...ports } = dependencies;
  const item = {
    getValue: () => root.getValue(),
    setValue: (value: string) => root.setValue(value),
    watch: (callback: (id: string | null) => void | Promise<void>) =>
      root.watch?.(callback) ?? (() => {}),
  };
  const storage = { defineItem: () => item } as unknown as BrowserStorage;
  return New({ ...ports, storage });
}
