import { message } from '../../../../shared/i18n/messages';
import type { CaptureBookmarksPort, CaptureError, PreparedCapture } from './services/interfaces';
export async function prepareCapture(
  bookmarks: CaptureBookmarksPort,
  id: string,
  url: string,
  error: CaptureError,
): Promise<PreparedCapture> {
  const ticket = await bookmarks.autoNameTicket(id),
    expected = await bookmarks.bookmark(id);
  if (expected.url !== url) throw error(message('bookmarks.errors.url_changed'));
  return { ticket, expected };
}
