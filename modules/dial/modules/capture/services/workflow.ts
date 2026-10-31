import type { CaptureWorkflowPorts, PreparedCapture } from './interfaces';
export async function updateBookmarkImages(
  ports: CaptureWorkflowPorts,
  id: string,
  url: string,
  prepared: PreparedCapture,
) {
  const { ticket, expected } = prepared;
  const results = await Promise.allSettled([
    ports.request(url).then(async (result) => {
      if (!ports.active()) return;
      await ports.bookmarks.cache(id, url, 'thumbnail', result.thumbnail, expected);
      if (!ports.active()) return;
      const icon = await ports.faviconBlob(url, result.favicon);
      if (!ports.active()) return;
      if (icon) await ports.bookmarks.cache(id, url, 'favicon', icon, expected);
      if (ports.active())
        await ports.bookmarks.applyCapturedTitle(id, url, result.title, ticket).catch(() => {});
    }),
    ports.faviconBlob(url).then(async (blob) => {
      if (blob && ports.active()) await ports.bookmarks.cache(id, url, 'favicon', blob, expected);
    }),
  ]);
  if (!ports.active()) return;
  await ports.refresh();
  ports.announce();
  if (results[0]?.status === 'rejected') throw results[0].reason;
}
