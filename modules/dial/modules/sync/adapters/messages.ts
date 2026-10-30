import type { IncomingSyncMessage } from '../entities/messages';
export function parseSettingsSyncMessage(value: unknown): IncomingSyncMessage | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('type' in value) ||
    value.type !== 'settings-sync' ||
    !('action' in value)
  )
    return null;
  const message = value as { type: 'settings-sync'; action: unknown; value?: unknown };
  switch (message.action) {
    case 'initialize':
    case 'flush':
    case 'retry':
      return { type: 'settings-sync', action: message.action };
    case 'patch':
      return message.value && typeof message.value === 'object' && !Array.isArray(message.value)
        ? {
            type: 'settings-sync',
            action: 'patch',
            value: message.value as Record<string, unknown>,
          }
        : null;
    case 'folder':
      return typeof message.value === 'string' && message.value.length <= 256
        ? { type: 'settings-sync', action: 'folder', value: message.value }
        : null;
    case 'confirm':
      return typeof message.value === 'boolean'
        ? { type: 'settings-sync', action: 'confirm', value: message.value }
        : null;
    default:
      return null;
  }
}
