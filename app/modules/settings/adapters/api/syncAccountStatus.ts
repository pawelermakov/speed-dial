import type { browser } from 'wxt/browser';
import type { SyncInfo } from '../../entities/sync';
export interface AccountStatusApi {
  identity?: Pick<typeof browser.identity, 'getProfileUserInfo'>;
  permissions: Pick<typeof browser.permissions, 'contains'>;
}
export async function syncStatus(
  api: AccountStatusApi,
  firefox = import.meta.env.BROWSER === 'firefox',
): Promise<SyncInfo> {
  if (firefox) return { status: 'unavailable', email: '' };
  try {
    if (
      !api.identity?.getProfileUserInfo ||
      !(await api.permissions.contains({ permissions: ['identity.email'] }))
    )
      return { status: 'unknown', email: '' };
    const info = await api.identity.getProfileUserInfo({ accountStatus: 'SYNC' });
    if (typeof info?.id !== 'string') return { status: 'unknown', email: '' };
    return info.id
      ? {
          status: 'enabled',
          email:
            typeof info.email === 'string' && info.email.length <= 254 ? info.email.trim() : '',
        }
      : { status: 'disabled', email: '' };
  } catch {
    return { status: 'unknown', email: '' };
  }
}
