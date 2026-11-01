import { createLazyLoader } from '../../../common/helpers/lazy';
import { abortable } from '../../../common/helpers/abortable';
import type {
  BookmarksDataPort,
  IBookmarksSource,
  IBookmarkActions,
  BookmarksRuntimePorts,
} from './interfaces';

export class BookmarksService {
  private readonly captureLoader;
  private readonly lifetime = new AbortController();

  constructor(
    public readonly source: IBookmarksSource,
    public readonly actions: IBookmarkActions,
    public readonly data: BookmarksDataPort,
    private readonly runtime: BookmarksRuntimePorts,
  ) {
    this.captureLoader = createLazyLoader(
      () => runtime.loadCapture(this.faviconBlob),
      (service) => service.dispose(),
    );
  }

  faviconBlob = (url: string, hint?: string) =>
    abortable(this.lifetime.signal, () =>
      this.runtime.faviconBlob(url, hint, this.lifetime.signal),
    );
  capture = () => abortable(this.lifetime.signal, () => this.captureLoader.get());
  dispose = () => {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort(new DOMException('Bookmarks service is disposed', 'AbortError'));
    this.captureLoader.dispose();
  };
}

export { BookmarksSource } from './source';
export { BookmarkActions } from './actions';

export * from './interfaces';
