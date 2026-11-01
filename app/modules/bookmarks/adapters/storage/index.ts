import type { BrowserStorage } from '../../../../common/infrastructure/browser/storage';
import type { RootPort } from '../../services/interfaces';
export class RootStorage implements RootPort {
  private readonly item;
  constructor(storage: BrowserStorage) {
    this.item = storage.defineItem<string>('local:rootFolderId');
  }
  getValue = () => this.item.getValue();
  setValue = (id: string) => this.item.setValue(id);
  watch: NonNullable<RootPort['watch']> = (callback) => this.item.watch(callback);
}
