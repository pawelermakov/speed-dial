import type { AssetsPort, AutoNamesPort, BookmarksPort, BookmarksDataPort } from './interfaces';

export class BookmarksDataService implements BookmarksDataPort {
  constructor(
    private readonly api: Pick<BookmarksPort, 'getChildren' | 'create'>,
    private readonly assets: Pick<AssetsPort, 'getStored' | 'clear'>,
    private readonly metadata: Pick<AutoNamesPort, 'get' | 'put' | 'clear'>,
  ) {}

  getChildren: BookmarksDataPort['getChildren'] = (id) => this.api.getChildren(id);
  create: BookmarksDataPort['create'] = (value) => this.api.create(value);
  readAssets: BookmarksDataPort['readAssets'] = (id, url) => this.assets.getStored(id, url);
  clearAssets = () => this.assets.clear();
  readAutoName: BookmarksDataPort['readAutoName'] = (id) => this.metadata.get(id);
  saveAutoName: BookmarksDataPort['saveAutoName'] = (ticket) => this.metadata.put(ticket);
  clearAutoNames = () => this.metadata.clear();
}
