import { useUiI18n, type TranslationContext } from '../common/i18n';
import { message } from '../common/i18n/messages';
import { LocalizedError, errorMessage } from '../common/i18n/errors';
import { type MessageText } from '../common/i18n/contracts';
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue';
import { defaults } from '../modules/settings';
import { type Snapshot } from '../entities/models';
import { validateSettings } from '../modules/settings/schema';
import type { DialDependencies } from '../services/application';
import { useServices } from './useServices';
import { useSettingsState } from '../modules/settings/composables';
import { useBackgroundState } from '../modules/appearance/composables';

export function useDial(
  dependencies: DialDependencies = useServices(),
  translations: Pick<TranslationContext, 'language' | 'setLanguage'> = useUiI18n(),
) {
  const { language, setLanguage } = translations;
  const {
    bookmarks: { source, actions, faviconBlob },
    snapshots,
    appearance,
    settings,
    lock: withDataLock,
    updates,
    events,
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
    save: (patch) => withDataLock(() => settings.patchSettings(patch)),
    read: () => withDataLock(async () => validateSettings((await settings.getValue())?.value)),
    watch: settings.watch?.bind(settings),
    setLanguage,
    publish: (settings) => {
      snapshot.value = { ...snapshot.value, settings };
    },
    onReadError: (error) => {
      notice.value = errorMessage(error);
    },
    errorText: errorMessage,
    flushSync: () => settings.sync.request('flush'),
  });
  const {
    ready: settingsReady,
    track,
    flush: flushSettings,
    updateSettings,
    changeSearchProvider,
  } = settingsState;
  const backgroundState = useBackgroundState({
    read: async () => (await appearance.readStored())?.blob ?? null,
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
  let hasSnapshot = false;
  const attempted = new Set<string>();
  const errorText = (error: unknown) => errorMessage(error);
  const readSnapshot = async (read: (includeBackground: boolean) => Promise<Snapshot>) => {
    if (disposed) return false;
    const sequence = ++generation;
    const includeBackground = backgroundState.dirty;
    const next = await withDataLock(() => read(includeBackground));
    if (sequence !== generation || disposed) return false;
    backgroundState.acceptRead(includeBackground);
    settingsState.confirm(next.settings, (settings) => {
      snapshot.value = {
        ...next,
        settings,
        background: includeBackground ? next.background : snapshot.value.background,
      };
    });
    hasSnapshot = true;
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
    return true;
  };
  const refresh = async () => {
    await readSnapshot((includeBackground) => snapshots.load(includeBackground));
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
            void settings.sync.request('folder', id);
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
  const unwatchRoot = source.watchRoot(async (id) => {
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
      await settings.sync.request('initialize');
      if (disposed) return;
      const applied = await readSnapshot((includeBackground) =>
        snapshots.initialize(includeBackground),
      );
      if (!applied && !disposed && !hasSnapshot) {
        clearTimeout(timer);
        await refresh();
      }
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
