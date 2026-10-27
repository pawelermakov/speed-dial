import type { Bookmark } from '../types/models';

type Resource = { key: string; url: string; ready: boolean; settled: boolean; image?: HTMLImageElement };

// Retain object URLs across snapshot refreshes; dispose only changed resources.
export class BookmarkImages {
  private thumbnails = new Map<string, Resource>();
  private favicons = new Map<string, Resource>();
  private waiters = new Set<() => void>();
  private folderIds = new Set<string>();
  private publishQueued = false;
  constructor(private changed: (previews: Record<string, string>, icons: Record<string, string>) => void) {}

  private schedulePublish() {
    // Decode callbacks arrive in separate browser tasks. Publishing each one
    // rerenders the entire grid even while its initial reveal is still hidden.
    if (this.publishQueued || this.pending) return;
    this.publishQueued = true;
    queueMicrotask(() => {
      if (!this.publishQueued) return;
      this.publishQueued = false;
      this.publish();
    });
  }

  private release(row: Resource) {
    if (row.image) { row.image.onload = null; row.image.onerror = null; row.image.src = ''; }
    URL.revokeObjectURL(row.url);
  }
  private publish() {
    this.changed(
      Object.fromEntries([...this.thumbnails].filter(([, row]) => row.ready).map(([id, row]) => [id, row.url])),
      Object.fromEntries([...this.favicons].map(([id, row]) => [id, row.url])),
    );
    if (!this.pending) {
      for (const resolve of this.waiters) resolve();
      this.waiters.clear();
    }
  }
  get pending() {
    for (const row of this.thumbnails.values()) if (!row.settled) return true;
    return false;
  }
  sync(tabs: Bookmark[], searching = false) {
    // Keep the open folder decoded while filtering, but release old search-only
    // results. Clearing the query can then restore the folder without decoding.
    if (!searching) this.folderIds = new Set(tabs.map(tab => tab.id));
    let changed = false;
    for (const kind of ['thumbnail', 'favicon'] as const) {
      const rows = kind === 'thumbnail' ? this.thumbnails : this.favicons;
      const wanted = new Set<string>();
      for (const tab of tabs) {
        const blob = tab[kind];
        if (!blob) continue;
        wanted.add(tab.id);
        const revision = kind === 'thumbnail' ? tab.thumbnailUpdatedAt : tab.faviconUpdatedAt;
        const key = JSON.stringify([tab.url, revision ?? 0, blob.size, blob.type]);
        const old = rows.get(tab.id);
        if (old?.key === key) continue;
        changed = true;
        if (old) this.release(old);
        const row: Resource = { key, url: URL.createObjectURL(blob), ready: kind === 'favicon', settled: kind === 'favicon' };
        rows.set(tab.id, row);
        if (kind === 'thumbnail') {
          const image = row.image = new Image();
          image.onload = () => {
            const finish = (decoded: boolean) => {
              if (rows.get(tab.id) !== row) return;
              row.ready = decoded && image.naturalWidth > 0;
              row.settled = true;
              this.schedulePublish();
            };
            // load alone need not mean pixels are decoded and ready to paint.
            void image.decode().then(() => finish(true), () => finish(false));
          };
          image.onerror = () => {
            if (rows.get(tab.id) !== row) return;
            row.settled = true;
            // Keep the failed entry to avoid re-decoding on unrelated refreshes.
            this.schedulePublish();
          };
          image.src = row.url;
        }
      }
      for (const [id, row] of rows) if (!wanted.has(id) && !(searching && this.folderIds.has(id))) { this.release(row); rows.delete(id); changed = true; }
    }
    if (changed) this.publish();
    return this.pending ? new Promise<void>(resolve => this.waiters.add(resolve)) : Promise.resolve();
  }
  dispose() {
    this.publishQueued = false;
    this.folderIds.clear();
    for (const rows of [this.thumbnails, this.favicons]) {
      for (const row of rows.values()) this.release(row);
      rows.clear();
    }
    for (const resolve of this.waiters) resolve();
    this.waiters.clear();
  }
}
