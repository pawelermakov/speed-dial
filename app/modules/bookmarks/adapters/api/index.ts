import type { BookmarksPort } from '../../services/interfaces';
import type { CreateBookmarkRequest, UpdateBookmarkRequest, MoveBookmarkRequest } from './requests';
import { bookmarkNode } from './responses';

/** Keep browser API binding and browser-specific behavior at the module boundary. */
export class BookmarksApi implements BookmarksPort {
  constructor(private readonly api: BookmarksPort) {}

  get: BookmarksPort['get'] = async (id) => (await this.api.get(id)).map(bookmarkNode);
  getTree: BookmarksPort['getTree'] = async () => (await this.api.getTree()).map(bookmarkNode);
  getSubTree: BookmarksPort['getSubTree'] = async (id) =>
    (await this.api.getSubTree(id)).map(bookmarkNode);
  getChildren: BookmarksPort['getChildren'] = async (id) =>
    (await this.api.getChildren(id)).map(bookmarkNode);
  create = async (value: CreateBookmarkRequest) => bookmarkNode(await this.api.create(value));
  update = async (id: string, value: UpdateBookmarkRequest) =>
    bookmarkNode(await this.api.update(id, value));
  move = async (id: string, value: MoveBookmarkRequest) =>
    bookmarkNode(await this.api.move(id, value));
  remove: BookmarksPort['remove'] = (id) => this.api.remove(id);
  removeTree: BookmarksPort['removeTree'] = (id) => this.api.removeTree(id);
}
