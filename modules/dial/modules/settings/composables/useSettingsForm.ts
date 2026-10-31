import { useUiI18n } from '../../../../../shared/i18n';
import { message } from '../../../../../shared/i18n/messages';
import { LocalizedError, errorMessage } from '../../../../../shared/i18n/errors';
import { type MessageText } from '../../../../../shared/i18n/contracts';
import { reactive, ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useServices } from '../../../../../app/serviceContext';
import type { Settings } from '../entities/models';
import type { FolderChoice } from '../../bookmarks';
import { validateSettings } from '../../../../../services/validation';
import { readImage } from '../../../../../services/images';
import type { SyncState } from '../../sync';
export interface SettingsFormProps {
  settings: Settings;
  busy: boolean;
  rootId: string | null;
  operationError: MessageText;
  hasBackground: boolean;
  updateSettings: (patch: Partial<Settings>) => Promise<boolean>;
  changeRoot: (id: string) => Promise<boolean>;
  changeBackground: (blob: Blob | null) => Promise<boolean>;
}
export interface SettingsFormEmit {
  (event: 'close'): void;
  (event: 'manage'): void;
  (event: 'error', message: MessageText): void;
}
export function useSettingsForm(props: SettingsFormProps, emit: SettingsFormEmit) {
  const { t, language } = useUiI18n();

  const {
    bookmarks: { source },
    syncRequest,
    syncState: syncStateItem,
    events: browserEvents,
  } = useServices();

  const syncState = ref<SyncState | null>(null);
  const unwatchSync = syncStateItem.watch((value) => {
    syncState.value = value;
  });
  onMounted(() => {
    void syncStateItem.getValue().then((value) => {
      syncState.value = value;
    });
  });
  onUnmounted(unwatchSync);
  const settingsDialog = ref<HTMLDialogElement>();
  onMounted(() => {
    settingsDialog.value?.showModal();
  });
  const numberFields = [
    {
      key: 'width',
      get label() {
        return t('settings.grid.width_percent');
      },
      min: 50,
      max: 100,
    },
    {
      key: 'countColumns',
      get label() {
        return t('settings.grid.columns');
      },
      min: 2,
      max: 12,
    },
    {
      key: 'space',
      get label() {
        return t('settings.grid.spacing_pixels');
      },
      min: 0,
      max: 48,
    },
  ] as const;
  type BufferedKey = 'width' | 'countColumns' | 'space';
  const values = reactive({
    width: String(props.settings.width),
    countColumns: String(props.settings.countColumns),
    space: String(props.settings.space),
  });
  const inputErrors = reactive<Partial<Record<BufferedKey, MessageText>>>({});
  const pending = new Map<BufferedKey, string | number>(),
    timers = new Map<BufferedKey, ReturnType<typeof setTimeout>>();
  const focused = ref<BufferedKey>();
  const writes = new Set<Promise<unknown>>();
  const error = ref<MessageText>(''),
    reading = ref(false);
  let disposed = false,
    folderGeneration = 0,
    folderRequest = 0,
    fileGeneration = 0,
    folderTimer: ReturnType<typeof setTimeout> | undefined,
    backgroundTask: Promise<unknown> | undefined;
  function track<T>(promise: Promise<T>) {
    writes.add(promise);
    void promise.finally(() => writes.delete(promise)).catch(() => {});
    return promise;
  }
  watch(
    () => props.settings,
    (settings) => {
      for (const key of Object.keys(values) as BufferedKey[])
        if (focused.value !== key && !pending.has(key)) values[key] = String(settings[key]);
    },
  );
  function input(key: BufferedKey, event: Event) {
    const element = event.target as HTMLInputElement;
    values[key] = element.value;
    try {
      if (!element.value.trim() || !element.validity.valid)
        throw new LocalizedError(message('validation.value.invalid'));
      const next = validateSettings({ ...props.settings, [key]: element.value });
      pending.set(key, next[key]);
      delete inputErrors[key];
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          void flushField(key);
        }, 275),
      );
    } catch {
      const field = numberFields.find((field) => field.key === key);
      inputErrors[key] = message('validation.number.range', { min: field?.min, max: field?.max });
    }
  }
  async function flushField(key: BufferedKey, force = false) {
    clearTimeout(timers.get(key));
    timers.delete(key);
    if (!pending.has(key)) {
      if (force) {
        await syncRequest('flush');
        if (!inputErrors[key] && focused.value !== key) values[key] = String(props.settings[key]);
      }
      return;
    }
    const value = pending.get(key)!;
    pending.delete(key);
    const saved = await track(props.updateSettings({ [key]: value }));
    if (!saved && values[key] === String(value) && !pending.has(key)) {
      await nextTick();
      values[key] = String(props.settings[key]);
    }
    if (force) await syncRequest('flush');
  }
  async function flush() {
    await Promise.all([...pending.keys()].map((key) => flushField(key)));
    if (backgroundTask) await backgroundTask;
    while (writes.size) await Promise.allSettled([...writes]);
    await syncRequest('flush');
  }
  async function close() {
    await flush();
    emit('close');
  }
  async function action() {
    await flush();
    if (Object.keys(inputErrors).length) {
      error.value = message('settings.errors.correct_before_managing_data');
      return;
    }
    emit('manage');
  }

  const folders = ref<FolderChoice[]>([]),
    folderLoading = ref(true),
    folderError = ref<MessageText>(''),
    selectedFolder = ref(props.rootId ?? '');
  const selectedChoice = computed(() =>
    folders.value.find((row) => row.id === selectedFolder.value),
  );
  watch(
    () => props.rootId,
    (id) => {
      if (!folderRequest) selectedFolder.value = id ?? '';
    },
  );
  async function loadFolders() {
    const current = ++folderGeneration;
    folderLoading.value = true;
    try {
      const next = await source.choices();
      if (!disposed && current === folderGeneration) {
        folders.value = next;
        folderError.value = '';
      }
    } catch (cause) {
      if (!disposed && current === folderGeneration)
        folderError.value = message('folders.errors.load_failed', { error: errorMessage(cause) });
    } finally {
      if (!disposed && current === folderGeneration) folderLoading.value = false;
    }
  }
  function scheduleFolders() {
    folderGeneration++;
    clearTimeout(folderTimer);
    folderTimer = setTimeout(() => {
      void loadFolders();
    }, 60);
  }
  async function folderChanged(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    selectedFolder.value = id;
    folderRequest++;
    try {
      await track(props.changeRoot(id));
    } finally {
      folderRequest--;
      if (!folderRequest) selectedFolder.value = props.rootId ?? '';
    }
  }
  let unsubscribeFolders: (() => void) | undefined;
  onMounted(() => {
    unsubscribeFolders = browserEvents.subscribe((assetsOnly) => {
      if (!assetsOnly) scheduleFolders();
    });
    void loadFolders();
  });
  onUnmounted(() => {
    disposed = true;
    folderGeneration++;
    fileGeneration++;
    clearTimeout(folderTimer);
    unsubscribeFolders?.();
    void flush();
  });
  function file(event: Event) {
    const element = event.target as HTMLInputElement,
      selected = element.files?.[0];
    if (!selected) return;
    const current = ++fileGeneration;
    reading.value = true;
    error.value = '';
    backgroundTask = (async () => {
      try {
        const blob = await readImage(selected);
        if (current === fileGeneration) await track(props.changeBackground(blob));
      } catch (cause) {
        if (current === fileGeneration) {
          error.value = message('background.errors.details', { error: errorMessage(cause) });
          emit('error', error.value);
        }
      } finally {
        if (current === fileGeneration) {
          reading.value = false;
          element.value = '';
        }
      }
    })();
  }
  watch(language, () => {
    void loadFolders();
  });
  const switchFields = [
    {
      key: 'addButton',
      get label() {
        return t('settings.bookmarks.add_button');
      },
    },
    {
      key: 'bookmarkSearch',
      get label() {
        return t('search.bookmarks.label');
      },
    },
    {
      key: 'movieSearch',
      get label() {
        return t('settings.bookmarks.movie_search');
      },
    },
  ] as const;

  return {
    track,
    syncState,
    settingsDialog,
    numberFields,
    values,
    inputErrors,
    focused,
    error,
    reading,
    input,
    flushField,
    flush,
    close,
    action,
    folders,
    folderLoading,
    folderError,
    selectedFolder,
    selectedChoice,
    loadFolders,
    folderChanged,
    file,
    switchFields,
  };
}
