import type { BookmarkNode, BookmarksPort } from '../services/bookmarks';
export class MockBookmarks implements BookmarksPort {
  nodes = new Map<string, BookmarkNode>(); next = 100;
  constructor() { this.nodes.set('root', { id: 'root', title: '' }); this.nodes.set('other', { id: 'other', parentId: 'root', title: 'Other', folderType: 'other', syncing: true, index: 0 }); }
  async get(id: string) { const node = this.nodes.get(id); if (!node) throw new Error('Missing node'); return [{ ...node }]; }
  async getChildren(id: string) { await this.get(id); return [...this.nodes.values()].filter(node => node.parentId === id).sort((a,b) => (a.index ?? 0) - (b.index ?? 0)).map(node => ({ ...node })); }
  async getSubTree(id: string): Promise<BookmarkNode[]> { const node = (await this.get(id))[0]!; return [{ ...node, ...(node.url ? {} : { children: await Promise.all((await this.getChildren(id)).map(async child => (await this.getSubTree(child.id))[0]!)) }) }]; }
  async getTree() { return this.getSubTree('root'); }
  async create(value: { parentId: string; title: string; url?: string }) { await this.get(value.parentId); const node = { ...value, id: String(this.next++), index: (await this.getChildren(value.parentId)).length }; this.nodes.set(node.id, node); return { ...node }; }
  async update(id: string, value: { title?: string; url?: string }) { const node = (await this.get(id))[0]!; Object.assign(node, value); this.nodes.set(id, node); return { ...node }; }
  async move(id: string, value: { parentId?: string; index?: number }) {
    const node = (await this.get(id))[0]!;
    const old = node.parentId!; const parent = value.parentId ?? old;
    const siblings = (await this.getChildren(parent)).filter(child => child.id !== id);
    node.parentId = parent; siblings.splice(Math.min(value.index ?? siblings.length, siblings.length), 0, node);
    siblings.forEach((child,index) => this.nodes.set(child.id, { ...child, index }));
    if (old !== parent) (await this.getChildren(old)).forEach((child,index) => this.nodes.set(child.id, { ...child, index }));
    return (await this.get(id))[0]!;
  }
  async remove(id: string) { if ((await this.getChildren(id)).length) throw new Error('Not empty'); this.nodes.delete(id); }
  async removeTree(id: string) { for (const child of await this.getChildren(id)) await this.removeTree(child.id); this.nodes.delete(id); }
}
