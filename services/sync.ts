import { browser } from 'wxt/browser';
export type SyncStatus = 'enabled' | 'disabled' | 'unknown' | 'unsupported';
export async function syncStatus(identity = browser.identity, firefox = import.meta.env.BROWSER === 'firefox'): Promise<SyncStatus> {
  if (firefox) return 'unsupported';
  try {
    if (!identity?.getProfileUserInfo || !await browser.permissions.contains({ permissions: ['identity.email'] })) return 'unknown';
    const info = await identity.getProfileUserInfo({ accountStatus: 'SYNC' });
    if (typeof info?.id !== 'string') return 'unknown';
    return info.id ? 'enabled' : 'disabled';
  } catch { return 'unknown'; }
}
