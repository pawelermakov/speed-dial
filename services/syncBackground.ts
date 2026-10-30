import { setLanguage } from './i18n';
import { storedSettings } from './settingsSchema';
import type { browser } from 'wxt/browser';
import type { DataLock } from '../shared/infrastructure/browser/interfaces';
import { SettingsSync } from './settingsSync';
import type { Settings } from '../types/models';

export function startSettingsSync(api: typeof browser, lock: DataLock) {
  let disposed = false;
  const cleanups: Array<() => void> = [];
  const firefox = import.meta.env.BROWSER === 'firefox';
  const coordinator = new SettingsSync({
    local: api.storage.local,
    sync: api.storage.sync,
    tree: () => api.bookmarks.getTree(),
    lock,
    async account() {
      if (firefox) return null; // Firefox exposes no browser-account identity API.
      try {
        if (!(await api.permissions.contains({ permissions: ['identity.email'] }))) return null;
        const info = await api.identity.getProfileUserInfo({ accountStatus: 'SYNC' });
        // Empty string is a confirmed signed-out profile; null is uncertainty.
        return typeof info.id === 'string' ? info.id : null;
      } catch {
        return null;
      }
    },
  });
  const ready = api.storage.local
    .get('settings')
    .then((saved) => {
      if (disposed) return;
      setLanguage(
        storedSettings((saved.settings as { value?: unknown } | undefined)?.value).language,
      );
      return coordinator.initialize();
    })
    .catch(() => {});
  const onMessage: Parameters<typeof api.runtime.onMessage.addListener>[0] = (message, sender) => {
    if (disposed) return;
    if (
      sender.id !== api.runtime.id ||
      !sender.url?.startsWith(api.runtime.getURL('/newtab.html')) ||
      message?.type !== 'settings-sync'
    )
      return;
    const task = async () => {
      await ready;
      if (disposed) return;
      switch (message.action) {
        case 'initialize':
          await coordinator.retry();
          return;
        case 'patch':
          if (message.value && typeof message.value === 'object' && !Array.isArray(message.value))
            await coordinator.changed(message.value as Partial<Settings>);
          return;
        case 'folder':
          if (typeof message.value === 'string' && message.value.length <= 256)
            await coordinator.selectFolder(message.value);
          return;
        // Accept the flush before waiting for rate limiting. The background owns
        // the write, so a settings panel can close immediately after local save.
        case 'flush':
          void coordinator.flush().catch(() => {});
          return;
        case 'retry':
          await coordinator.retry();
          return;
        case 'confirm':
          if (typeof message.value === 'boolean') await coordinator.confirmLocal(message.value);
          return;
      }
    };
    return task().then(() => ({ ok: true }));
  };
  api.runtime.onMessage.addListener(onMessage);
  cleanups.push(() => api.runtime.onMessage.removeListener(onMessage));
  const onStorageChanged: Parameters<typeof api.storage.onChanged.addListener>[0] = (
    changes,
    area,
  ) => {
    if (disposed) return;
    if (area === 'local' && changes.settings)
      setLanguage(
        storedSettings((changes.settings.newValue as { value?: unknown } | undefined)?.value)
          .language,
      );
    if (area === 'sync')
      void ready
        .then(() => {
          if (!disposed) return coordinator.remote(changes);
        })
        .catch(() => {});
  };
  api.storage.onChanged.addListener(onStorageChanged);
  cleanups.push(() => api.storage.onChanged.removeListener(onStorageChanged));
  const events = [
    api.bookmarks.onCreated,
    api.bookmarks.onRemoved,
    api.bookmarks.onChanged,
    api.bookmarks.onMoved,
    api.bookmarks.onImportEnded,
  ];
  for (const event of events) {
    const listener = (id?: unknown) => {
      void ready
        .then(() => {
          if (!disposed)
            return coordinator.bookmarksChanged(typeof id === 'string' ? id : undefined);
        })
        .catch(() => {});
    };
    event?.addListener(listener);
    cleanups.push(() => event?.removeListener(listener));
  }
  const signInChanged = () => {
    if (!disposed) void coordinator.accountChanged().catch(() => {});
  };
  if (!firefox) {
    api.identity?.onSignInChanged?.addListener(signInChanged);
    cleanups.push(() => api.identity?.onSignInChanged?.removeListener(signInChanged));
  }
  const activated = () => {
    void ready
      .then(() => {
        if (!disposed) return coordinator.retry();
      })
      .catch(() => {});
  };
  api.tabs.onActivated.addListener(activated);
  cleanups.push(() => api.tabs.onActivated.removeListener(activated));
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
      coordinator.dispose();
    },
  };
}
