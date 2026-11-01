import type { DialDatabase } from '../../../../common/infrastructure/database';
import type { BackgroundStoragePort } from '../../services/interfaces';
export class BackgroundStorage implements BackgroundStoragePort {
  constructor(private readonly db: DialDatabase) {}
  get = () => this.db.assets.get('background');
  put: BackgroundStoragePort['put'] = async (asset) => {
    await this.db.assets.put(asset);
  };
  remove = async () => {
    await this.db.assets.delete('background');
  };
}
