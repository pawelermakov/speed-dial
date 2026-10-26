import { message } from './i18n';
import { browser } from 'wxt/browser';
const outgoing=new Set<Promise<void>>();
export async function syncRequest(action: string, value?: unknown): Promise<void> {
  if(action==='flush')await Promise.allSettled([...outgoing]);
  const task=send(action,value);
  if(action==='patch'||action==='folder'){
    outgoing.add(task);void task.finally(()=>outgoing.delete(task));
  }
  await task;
}
async function send(action:string,value:unknown){
  try {
    await browser.runtime.sendMessage({ type: 'settings-sync', action, value });
  } catch {
    try {
      const existing=await browser.storage.local.get('settingsSyncState');
      await browser.storage.local.set({ settingsSyncState: { folder:'',confirm:false,...existing.settingsSyncState as object,error:message('sync.errors.unavailable_saved_locally') } });
    }catch{/* Local settings remain usable even when status storage is unavailable. */}
  }
}
