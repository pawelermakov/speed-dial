import type { DialDatabase } from './database';

// Consume only the expected event(s) from our fallback update. Every later
// external edit invalidates provenance, even when it explicitly sets a domain.
export async function invalidateAutoName(
  db: DialDatabase,
  id: string,
  change: { url?: string; title?: string },
) {
  await db.transaction('rw', db.autoNames, async () => {
    const marker = await db.autoNames.get(id);
    if (
      marker?.pendingEdit &&
      (marker.pendingEdit.url || marker.pendingEdit.title) &&
      (change.url === undefined || change.url === marker.url) &&
      (change.title === undefined || change.title === new URL(marker.url).hostname)
    ) {
      // Firefox may deliver URL and title as separate events.
      const pendingEdit = {
        url: marker.pendingEdit.url && change.url === undefined,
        title: marker.pendingEdit.title && change.title === undefined,
      };
      await db.autoNames.update(id, { pendingEdit });
    } else await db.autoNames.delete(id);
  });
}
