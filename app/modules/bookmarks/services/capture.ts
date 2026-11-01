import { message } from '../../../common/i18n/messages';
import { abortable } from '../../../common/helpers/abortable';
import type {
  BookmarkCaptureDependencies,
  CaptureCompletion,
  IBookmarkCaptureService,
} from './interfaces';

export class BookmarkCaptureService implements IBookmarkCaptureService {
  private readonly lifetime = new AbortController();
  constructor(private readonly ports: BookmarkCaptureDependencies) {}

  updateImages = (id: string, url: string, completion: CaptureCompletion) =>
    abortable(this.lifetime.signal, async () => {
      const signal = this.lifetime.signal;
      const ticket = await this.ports.actions.autoNameTicket(id);
      const expected = await this.ports.source.bookmark(id);
      signal.throwIfAborted();
      if (expected.url !== url) throw this.ports.error(message('bookmarks.errors.url_changed'));
      const results = await Promise.allSettled([
        this.ports.client.requestThumbnail(url).then(async (result) => {
          if (signal.aborted) return;
          await this.ports.actions.cache(id, url, 'thumbnail', result.thumbnail, expected);
          if (signal.aborted) return;
          const icon = await this.ports.faviconBlob(url, result.favicon);
          if (signal.aborted) return;
          if (icon) await this.ports.actions.cache(id, url, 'favicon', icon, expected);
          if (!signal.aborted)
            await this.ports.actions
              .applyCapturedTitle(id, url, result.title, ticket)
              .catch(() => {});
        }),
        this.ports.faviconBlob(url).then(async (blob) => {
          if (blob && !signal.aborted)
            await this.ports.actions.cache(id, url, 'favicon', blob, expected);
        }),
      ]);
      signal.throwIfAborted();
      await completion.refresh();
      signal.throwIfAborted();
      completion.announce();
      if (results[0]?.status === 'rejected') throw results[0].reason;
    });

  dispose = () => {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort(new DOMException('Capture service is disposed', 'AbortError'));
    this.ports.client.dispose();
  };
}
