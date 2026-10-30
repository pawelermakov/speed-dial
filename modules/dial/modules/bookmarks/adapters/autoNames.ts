import type { DialDatabase } from '../../../../../shared/infrastructure/database';
import type { AutoNamesPort } from '../services/interfaces';
import type { AutoNameTicket } from '../entities/models';
export class AutoNameStore implements AutoNamesPort {
  constructor(private db: DialDatabase) {}
  get(id: string) {
    return this.db.autoNames.get(id);
  }
  async put(value: AutoNameTicket) {
    await this.db.autoNames.put(value);
  }
  async delete(id: string) {
    await this.db.autoNames.delete(id);
  }
  async clear() {
    await this.db.autoNames.clear();
  }
  async invalidate(id: string, change: { url?: string; title?: string }) {
    await this.db.transaction('rw', this.db.autoNames, async () => {
      const marker = await this.db.autoNames.get(id);
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
        await this.db.autoNames.update(id, { pendingEdit });
      } else await this.db.autoNames.delete(id);
    });
  }
}
