import type {
  IBookmarkActions,
  BookmarkActionsDependencies,
  EditBookmarkInput,
} from './interfaces';
import { message } from '../../../common/i18n/messages';
import type { AutoNameTicket, BookmarkNode } from '../entities/models';
import { isBookmark, isFolder } from '../helpers/folders';
export class BookmarkActions implements IBookmarkActions {
  constructor(private readonly ports: BookmarkActionsDependencies) {}
  async add(input: { url: string; title: string; parentId?: string }) {
    const parent = await this.ports.source.parent(input.parentId);
    const url = this.ports.normalizeUrl(input.url);
    const title = input.title.trim() ? input.title : '';
    const id = (
      await this.ports.api.create({
        parentId: parent.id,
        url,
        title: title || new URL(url).hostname,
      })
    ).id;
    if (!title) await this.markAutoName(id, url);
    return id;
  }
  private async markAutoName(
    bookmarkId: string,
    url: string,
    pendingEdit?: AutoNameTicket['pendingEdit'],
  ) {
    // Optional provenance: failure must never turn a saved bookmark into a failed submit.
    await this.ports.metadata
      .put({ bookmarkId, url, token: crypto.randomUUID(), pendingEdit })
      .catch(() => {});
  }
  async edit({ id, url, title, parentId, titleEdited = true, expected }: EditBookmarkInput) {
    const before = await this.ports.source.bookmark(id);
    if (
      expected &&
      (before.url !== expected.url ||
        before.title !== expected.title ||
        before.parentId !== expected.parentId)
    )
      throw this.ports.presentation.error(message('bookmarks.errors.changed_in_another_window'));
    url = this.ports.normalizeUrl(url);
    if (!title.trim()) title = '';
    if (parentId) await this.ports.source.parent(parentId);
    const marker = await this.ports.metadata.get(id).catch(() => undefined);
    const automatic =
      !title ||
      (!titleEdited &&
        marker?.url === before.url &&
        before.title === new URL(before.url!).hostname);
    const nextTitle = automatic ? new URL(url).hostname : title;
    const changed = before.url !== url || before.title !== nextTitle;
    if (!automatic || changed || titleEdited || !marker) {
      await this.ports.metadata.delete(id).catch(() => {});
      if (automatic)
        await this.markAutoName(id, url, {
          url: before.url !== url,
          title: before.title !== nextTitle,
          previousUrl: before.url,
          previousTitle: before.title,
        });
    }
    try {
      if (changed) await this.ports.api.update(id, { url, title: nextTitle });
    } catch (error) {
      await this.ports.metadata.delete(id).catch(() => {});
      throw error;
    }
    if (parentId && parentId !== before.parentId) {
      await this.ports.source.bookmark(id);
      await this.ports.source.parent(parentId);
      await this.ports.api.move(id, { parentId });
    }
    return before.url !== url;
  }
  async autoNameTicket(id: string) {
    return this.ports.metadata.get(id).catch(() => undefined);
  }
  async applyCapturedTitle(
    id: string,
    url: string,
    title: string,
    ticket: AutoNameTicket | undefined,
  ) {
    title = title.replace(/\s+/g, ' ').trim();
    if (
      !ticket ||
      !title ||
      title.length > 4096 ||
      // eslint-disable-next-line no-control-regex -- Reject control characters in imported titles.
      /[\u0000-\u001f\u007f]/.test(title) ||
      /^(about:|chrome:|edge:|moz-extension:|https?:\/\/|error\b|ошибка\b|access denied|just a moment|attention required)/i.test(
        title,
      ) ||
      title.toLowerCase().replace(/^www\./, '') ===
        new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    )
      return;
    await this.ports.lock(async () => {
      const marker = await this.autoNameTicket(id);
      if (marker?.token !== ticket.token || marker.url !== url) return;
      let node: BookmarkNode;
      try {
        node = await this.ports.source.bookmark(id);
      } catch {
        return;
      }
      if (node.url !== url || node.title !== new URL(url).hostname) return;
      await this.ports.metadata.delete(id);
      await this.ports.api.update(id, { title });
    });
  }
  async cache(
    id: string,
    url: string,
    resource: 'thumbnail' | 'favicon',
    blob: Blob,
    expected?: { title: string; parentId?: string },
  ) {
    const node = await this.ports.source.node(id);
    if (
      node.url !== url ||
      (expected && (node.title !== expected.title || node.parentId !== expected.parentId))
    )
      throw this.ports.presentation.error(message('bookmarks.errors.changed_before_saving_image'));
    await this.ports.assets.put(id, url, resource, blob);
  }
  async remove(id: string) {
    await this.ports.source.bookmark(id);
    await this.ports.api.remove(id);
    await this.ports.assets.remove(id);
    await this.ports.metadata.delete(id);
  }
  private async sortChildren(
    parentId: string,
    ids: string[],
    folders: boolean,
    expected?: string[],
  ) {
    const sourceRoot = this.ports.source.rootId;
    const original = await this.ports.api.getChildren(parentId);
    const nodes = original.filter((node) =>
      folders ? isFolder(node) && !node.unmodifiable : isBookmark(node),
    );
    const order = nodes.map((node) => node.id);
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== order.length ||
      order.some((id) => !ids.includes(id)) ||
      (expected && expected.join() !== order.join())
    )
      throw this.ports.presentation.error(message('bookmarks.errors.list_changed_before_drop'));
    let cursor = 0;
    const desired = original.map((node) => (order.includes(node.id) ? ids[cursor++]! : node.id));
    const current = original.map((node) => node.id);
    for (let i = 0; i < desired.length; i++) {
      while (current[i] !== desired[i]) {
        const actual = await this.ports.api.getChildren(parentId);
        if (
          this.ports.source.rootId !== sourceRoot ||
          actual.map((node) => node.id).join() !== current.join() ||
          actual.some(
            (node) =>
              node.url !== original.find((row) => row.id === node.id)?.url ||
              node.title !== original.find((row) => row.id === node.id)?.title,
          )
        )
          throw this.ports.presentation.error(message('bookmarks.errors.list_changed_before_drop'));
        await this.ports.source.parent(parentId);
        const id = order.includes(desired[i]!) ? desired[i]! : current[i]!;
        const target = desired[i] === id ? i : desired.indexOf(id);
        // Chromium counts the destination before removing the source; Firefox
        // and the test port count its final position in the resulting children.
        const index = this.ports.moveIndex(current.indexOf(id), target);
        await this.ports.api.move(id, { parentId, index });
        current.splice(current.indexOf(id), 1);
        current.splice(target, 0, id);
      }
    }
    if (
      (await this.ports.api.getChildren(parentId)).map((node) => node.id).join() !== desired.join()
    )
      throw this.ports.presentation.error(message('bookmarks.notices.order_changed'));
  }
  async reorder(ids: string[], expected?: string[], parentId = this.ports.source.activeId) {
    if (parentId !== this.ports.source.activeId)
      throw this.ports.presentation.error(message('folders.errors.changed_before_drop'));
    const parent = await this.ports.source.parent(parentId ?? undefined);
    await this.sortChildren(parent.id, ids, false, expected);
  }
  async reorderFolders(ids: string[], expected?: string[]) {
    const root = await this.ports.source.rootNode();
    await this.sortChildren(root.id, ids, true, expected);
  }
  async createFolder(title: string) {
    const root = await this.ports.source.rootNode();
    if (!title.trim()) throw this.ports.presentation.error(message('validation.name.required'));
    const node = await this.ports.api.create({ parentId: root.id, title: title.trim() });
    this.ports.source.activeId = node.id;
  }
  async childFolder(id: string): Promise<BookmarkNode> {
    const node = await this.ports.source.parent(id);
    if (id === this.ports.source.rootId)
      throw this.ports.presentation.error(message('folders.errors.protected_root'));
    return node;
  }
  async renameFolder(id: string, title: string) {
    await this.childFolder(id);
    if (!title.trim()) throw this.ports.presentation.error(message('validation.name.required'));
    if ((await this.childFolder(id)).title !== title.trim())
      await this.ports.api.update(id, { title: title.trim() });
  }
  async removeFolder(id: string) {
    await this.childFolder(id);
    await this.ports.api.removeTree(id);
  }
  async moveFolder(id: string, beforeId: string) {
    await this.childFolder(id);
    const target = await this.childFolder(beforeId);
    await this.ports.api.move(id, {
      parentId: this.ports.source.rootId!,
      index: target.index ?? 0,
    });
  }
}
