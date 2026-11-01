import { message } from '../../../common/i18n/messages';
import type { SyncAction, SettingsSyncMessage } from '../entities/syncMessages';
import type {
  ISettingsSyncService,
  SettingsSyncDependencies,
  SyncClient,
  SyncStatusStoragePort,
} from './interfaces';

export class SettingsSyncService implements ISettingsSyncService {
  private readonly outgoing = new Set<Promise<void>>();
  constructor(private readonly dependencies: SettingsSyncDependencies) {}

  private async send(action: SyncAction, value: unknown) {
    try {
      await this.dependencies.transport.send({
        type: 'settings-sync',
        action,
        value,
      } as SettingsSyncMessage);
    } catch {
      try {
        await this.dependencies.transport.unavailable(
          message('sync.errors.unavailable_saved_locally'),
        );
      } catch {
        /* Local settings remain usable when transport and status storage are unavailable. */
      }
    }
  }

  request: SyncClient = async (action: SyncAction, value?: unknown) => {
    if (action === 'flush') await Promise.allSettled([...this.outgoing]);
    const task = this.send(action, value);
    if (action === 'patch' || action === 'folder') {
      this.outgoing.add(task);
      void task.finally(() => this.outgoing.delete(task));
    }
    await task;
  };
  getValue = () => this.dependencies.storage.getValue();
  watch: SyncStatusStoragePort['watch'] = (callback) => this.dependencies.storage.watch(callback);
  getStatus = () => this.dependencies.accountStatus();
}
