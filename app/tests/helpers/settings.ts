import { SettingsService } from '../../modules/settings/services/settings';
import type { SettingsServicePorts } from '../../modules/settings/services/interfaces';

// Persistence fixtures use an explicit local-only sync implementation; transport has its own tests.
export function createSettingsModule(ports: Omit<SettingsServicePorts, 'sync'>) {
  return new SettingsService({
    ...ports,
    sync: {
      request: async () => {},
      getValue: async () => null,
      watch: () => () => {},
      getStatus: async () => ({ status: 'unavailable', email: '' }),
    },
  });
}
