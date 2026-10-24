import { browser } from 'wxt/browser';
export type SyncStatus = 'enabled' | 'disabled' | 'unknown' | 'unavailable';
export interface SyncInfo {status:SyncStatus;email:string}
export async function syncStatus(identity = browser.identity, firefox = import.meta.env.BROWSER === 'firefox'): Promise<SyncInfo> {
  if (firefox) return {status:'unavailable',email:''};
  try {
    if (!identity?.getProfileUserInfo || !await browser.permissions.contains({ permissions: ['identity.email'] })) return {status:'unknown',email:''};
    const info = await identity.getProfileUserInfo({ accountStatus: 'SYNC' });
    if (typeof info?.id !== 'string') return {status:'unknown',email:''};
    return info.id ? {status:'enabled',email:typeof info.email==='string'&&info.email.length<=254?info.email.trim():''} : {status:'disabled',email:''};
  } catch { return {status:'unknown',email:''}; }
}
