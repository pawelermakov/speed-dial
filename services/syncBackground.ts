import { setLanguage } from './i18n';
import { storedSettings } from './settingsSchema';
import { browser } from 'wxt/browser';
import { withDataLock } from './repository';
import { SettingsSync } from './settingsSync';
import type { Settings } from '../types/models';

export function startSettingsSync() {
  const firefox = import.meta.env.BROWSER === 'firefox';
  const coordinator = new SettingsSync({
    local: browser.storage.local,
    sync: browser.storage.sync,
    tree: () => browser.bookmarks.getTree(),
    lock: withDataLock,
    async account() {
      if (firefox) return null; // Firefox exposes no browser-account identity API.
      try {
        if (!await browser.permissions.contains({ permissions: ['identity.email'] })) return null;
        const info = await browser.identity.getProfileUserInfo({ accountStatus: 'SYNC' });
        // Empty string is a confirmed signed-out profile; null is uncertainty.
        return typeof info.id === 'string' ? info.id : null;
      } catch { return null; }
    },
  });
  const ready = browser.storage.local.get('settings').then(saved=>{setLanguage(storedSettings((saved.settings as {value?:unknown}|undefined)?.value).language);return coordinator.initialize();}).catch(() => {});
  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('/newtab.html')) || message?.type !== 'settings-sync') return;
    const task = async () => {
      await ready;
      switch (message.action) {
        case 'initialize': await coordinator.retry(); return;
        case 'patch':
          if (message.value && typeof message.value === 'object' && !Array.isArray(message.value)) await coordinator.changed(message.value as Partial<Settings>);
          return;
        case 'folder': if (typeof message.value === 'string' && message.value.length <= 256) await coordinator.selectFolder(message.value); return;
        // Accept the flush before waiting for rate limiting. The background owns
        // the write, so a settings panel can close immediately after local save.
        case 'flush': void coordinator.flush().catch(() => {}); return;
        case 'retry': await coordinator.retry(); return;
        case 'confirm': if (typeof message.value === 'boolean') await coordinator.confirmLocal(message.value); return;
      }
    };
    return task().then(() => ({ ok: true }));
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if(area==='local'&&changes.settings)setLanguage(storedSettings((changes.settings.newValue as {value?:unknown}|undefined)?.value).language);
    if (area === 'sync') void ready.then(() => coordinator.remote(changes)).catch(() => {});
  });
  const events = [browser.bookmarks.onCreated, browser.bookmarks.onRemoved, browser.bookmarks.onChanged, browser.bookmarks.onMoved, browser.bookmarks.onImportEnded];
  for (const event of events) event?.addListener((id?:unknown) => { void ready.then(() => coordinator.bookmarksChanged(typeof id==='string'?id:undefined)).catch(() => {}); });
  if (!firefox) browser.identity?.onSignInChanged?.addListener(() => { void coordinator.accountChanged().catch(() => {}); });
  browser.tabs.onActivated.addListener(() => { void ready.then(() => coordinator.retry()).catch(() => {}); });
}
