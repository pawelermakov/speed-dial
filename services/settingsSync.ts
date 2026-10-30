// Compatibility exports; coordinator algorithm is owned by sync.
export {
  SettingsSync,
  type StorageArea,
  type SyncPorts,
} from '../modules/dial/modules/sync/services/coordinator';
export { syncStateKey, type SyncState } from '../modules/dial/modules/sync/entities/models';
