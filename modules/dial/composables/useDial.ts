import {
  setLanguage,
  language,
  message,
  LocalizedError,
  errorMessage,
  type MessageText,
} from '../../../services/i18n';
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue';
import { defaults } from '../modules/settings';
import { type Snapshot } from '..';
import { validateSettings } from '../../../services/validation';
import type { DialDependencies } from '..';
import { useServices } from '../../../app/serviceContext';
import { useSettingsState } from '../modules/settings/composables/useSettingsState';
import { useBackgroundState } from '../modules/appearance/composables/useBackgroundState';

export function useDial(dependencies: DialDependencies = useServices()) {
  const {
    bookmarks: { source, actions },
    snapshots,
    preferences,
    appearance,
    settings: settingsItem,
    root: rootItem,
    lock: withDataLock,
    syncRequest,
    updates,
    events,
    readBackground,
    faviconBlob,
  } = dependencies;
  const snapshot = shallowRef<Snapshot>({
    tabs: [],
    folders: [],
    rootId: null,
    activeId: null,
    settings: { ...defaults },
    background: null,
  });
  const loading = ref(true),
    busy = ref(false),
    notice = ref<MessageText>('');
  const revision = ref(0);
  const workflowErrors = ref<Record<string, MessageText>>({});
  const settingsState = useSettingsState({
    current: () => snapshot.value.settings,
    canSave: () => !busy.value && !loading.value,
    validate: validateSettings,
    save: (patch) => withDataLock(() => preferences.patchSettings(patch)),
    read: () => withDataLock(async () => validateSettings((await settingsItem.getValue())?.value)),
    watch: settingsItem.watch?.bind(settingsItem),
    setLanguage,
    publish: (settings) => {
      snapshot.value = { ...snapshot.value, settings };
    },
    onReadError: (error) => {
      notice.value = errorMessage(error);
    },
    errorText: errorMessage,
    flushSync: () => syncRequest('flush'),
  });
  const {
    ready: settingsReady,
    track,
    flush: flushSettings,
    updateSettings,
    changeSearchProvider,
  } = settingsState;
  const backgroundState = useBackgroundState({
    read: readBackground,
    save: (blob) => withDataLock(() => appearance.save(blob)),
    publish: (background) => {
      snapshot.value = { ...snapshot.value, background };
    },
    track,
    announce: () => updates.publish({ type: 'updated', background: true }),
    errorText: errorMessage,
  });
  const { change: changeBackground } = backgroundState;
  const settingErrors = computed<Record<string, MessageText>>(() => ({
    ...(backgroundState.error.value ? { background: backgroundState.error.value } : {}),
    ...settingsState.errors.value,
    ...workflowErrors.value,
  }));
  let rootVersion = 0;
  let generation = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    disposed = false;
  const attempted = new Set<string>();
  const errorText = (error: unknown) => errorMessage(error);
  const refresh = async () => {
    if (disposed) return;
    const sequence = ++generation;
    const includeBackground = backgroundState.dirty;
    const next = await withDataLock(() => snapshots.load(includeBackground));
    if (sequence !== generation || disposed) return;
    backgroundState.acceptRead(includeBackground);
    settingsState.confirm(next.settings, (settings) => {
      snapshot.value = {
        ...next,
        settings,
        background: includeBackground ? next.background : snapshot.value.background,
      };
    });
    if (next.rootNotice) {
      notice.value = next.rootNotice;
      workflowErrors.value = { ...workflowErrors.value, root: next.rootNotice };
      source.clearSourceNotice?.();
    }
    for (const tab of next.tabs.filter((tab) => !tab.favicon)) {
      const key = tab.id + tab.url;
      if (attempted.has(key)) continue;
      attempted.add(key);
      void faviconBlob(tab.url)
        .then(async (blob) => {
          if (!blob || disposed) return;
          await actions.cache(tab.id, tab.url, 'favicon', blob);
          schedule(false);
          updates.publish({ type: 'updated', assets: true });
        })
        .catch(() => {});
    }
  };
  const schedule = (invalidateDrag = true) => {
    if (disposed) return;
    generation++;
    if (invalidateDrag) revision.value++;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void refresh().catch((error) => {
        notice.value = errorText(error);
      });
    }, 60);
  };
  const run = async (
    operation: () => Promise<unknown>,
    changesBackground = false,
  ): Promise<boolean> => {
    if (busy.value || loading.value) return false;
    busy.value = true;
    try {
      await flushSettings();
      await withDataLock(operation);
      if (changesBackground) {
        backgroundState.invalidate();
        workflowErrors.value = {};
        settingsState.clearErrors();
        backgroundState.clearError();
        backgroundState.clearError();
      }
      await refresh();
      updates.publish({ type: 'updated', background: changesBackground });
      return true;
    } catch (error) {
      notice.value = errorText(error);
      if (changesBackground) backgroundState.invalidate();
      await refresh().catch(() => {});
      return false;
    } finally {
      busy.value = false;
    }
  };
  const changeRoot = (id: string): Promise<boolean> => {
    const version = ++rootVersion;
    return track(
      (async () => {
        try {
          await withDataLock(() => source.selectRoot(id));
          if (version === rootVersion) {
            void syncRequest('folder', id);
            delete workflowErrors.value.root;
            await refresh();
            updates.publish({ type: 'updated' });
          }
          return true;
        } catch (error) {
          if (version === rootVersion) {
            workflowErrors.value = {
              ...workflowErrors.value,
              root: message('settings.errors.save_folder_failed', { error: errorText(error) }),
            };
            await refresh().catch(() => {});
          }
          return false;
        }
      })(),
    );
  };
  const stopLanguage = watch(language, () => {
    if (settingsReady.value && !disposed) schedule(false);
  });
  onUnmounted(stopLanguage);
  const unsubscribeUpdates = updates.subscribe((update) => {
    const message = update === 'updated' ? undefined : update;
    if (message?.background || update === 'updated') backgroundState.invalidate();
    schedule(!message?.assets);
  });
  const unwatchRoot = rootItem.watch(async (id) => {
    if (disposed || id === source.rootId) return;
    try {
      const changed = await withDataLock(async () => {
        if (disposed || id === source.rootId) return false;
        generation++;
        await source.adoptRoot(id);
        return true;
      });
      if (changed) schedule();
    } catch (error) {
      notice.value = errorText(error);
      schedule();
    }
  });
  const unsubscribeEvents = events.subscribe((assetsOnly) => {
    attempted.clear();
    schedule(!assetsOnly);
  });
  onMounted(async () => {
    // Wallpaper should not wait for sync and the bookmark tree.
    backgroundState.loadInitial();
    try {
      if (!events.available) throw new LocalizedError(message('bookmarks.errors.api_unavailable'));
      await syncRequest('initialize');
      if (disposed) return;
      const initial = await withDataLock(() => snapshots.initialize());
      if (disposed) return;
      if (initial?.rootNotice) notice.value = initial.rootNotice;
      await refresh();
    } catch (error) {
      if (!disposed)
        notice.value = message('bookmarks.errors.open_failed', { error: errorText(error) });
    } finally {
      if (!disposed) loading.value = false;
    }
  });
  onUnmounted(() => {
    disposed = true;
    unwatchRoot();
    generation++;
    clearTimeout(timer);
    unsubscribeEvents();
    unsubscribeUpdates();
  });
  const announce = () => updates.publish({ type: 'updated' });
  return {
    snapshot,
    loading,
    settingsReady,
    busy,
    notice,
    run,
    refresh,
    announce,
    revision,
    changeSearchProvider,
    updateSettings,
    changeRoot,
    changeBackground,
    flushSettings,
    settingErrors,
  };
}
