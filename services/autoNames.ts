// Compatibility function for existing consumers; logic belongs to bookmarks.
import type { DialDatabase } from './database';
import { AutoNameStore } from '../modules/dial/modules/bookmarks/adapters/autoNames';
export function invalidateAutoName(
  db: DialDatabase,
  id: string,
  change: { url?: string; title?: string },
) {
  return new AutoNameStore(db).invalidate(id, change);
}
