<script setup lang="ts">
import {
  t,
  formatMessage,
  language,
  languages,
  message,
  LocalizedError,
  errorMessage,
  type MessageText,
} from '../services/i18n';
import { weatherCities, weatherProviders } from '../utils/weather';
import SelectChevron from './SelectChevron.vue';
import { cycleDialogFocus } from '../utils/keyboard';
import SwitchControl from './SwitchControl.vue';
import InfoTooltip from './InfoTooltip.vue';
import PanelHeader from './PanelHeader.vue';
import { ui } from '../utils/ui';
import { reactive, ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { browser } from 'wxt/browser';
import { useServices } from '../app/serviceContext';
const { repository, syncRequest, syncState: syncStateItem } = useServices();
import type { Settings, FolderChoice } from '../types/models';
import { validateSettings } from '../services/validation';
import { readImage } from '../services/images';
import SyncStatus from './SyncStatus.vue';
import type { SyncState } from '../services/settingsSync';
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
const props = defineProps<{
  settings: Settings;
  busy: boolean;
  rootId: string | null;
  operationError: MessageText;
  hasBackground: boolean;
  updateSettings: (patch: Partial<Settings>) => Promise<boolean>;
  changeRoot: (id: string) => Promise<boolean>;
  changeBackground: (blob: Blob | null) => Promise<boolean>;
}>();
const emit = defineEmits<{ close: []; manage: []; error: [message: MessageText] }>();
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
defineExpose({ flush });
const folders = ref<FolderChoice[]>([]),
  folderLoading = ref(true),
  folderError = ref<MessageText>(''),
  selectedFolder = ref(props.rootId ?? '');
const selectedChoice = computed(() => folders.value.find((row) => row.id === selectedFolder.value));
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
    const next = await repository.choices();
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
const api = browser.bookmarks;
const events = [
  api?.onCreated,
  api?.onRemoved,
  api?.onChanged,
  api?.onMoved,
  api?.onChildrenReordered,
  api?.onImportEnded,
];
onMounted(() => {
  events.forEach((event) => event?.addListener(scheduleFolders));
  void loadFolders();
});
onUnmounted(() => {
  disposed = true;
  folderGeneration++;
  fileGeneration++;
  clearTimeout(folderTimer);
  events.forEach((event) => event?.removeListener(scheduleFolders));
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
</script>
<template>
  <dialog
    id="settings-modal"
    ref="settingsDialog"
    class="settings-overlay ui-overlay fixed inset-0 z-20 w-full h-full max-w-none max-h-none m-0 border-0 p-0 text-[var(--ui-text)] backdrop:bg-transparent"
    :aria-label="t('settings.title')"
    aria-modal="true"
    @keydown.tab="cycleDialogFocus($event, settingsDialog)"
    @cancel.prevent.stop="close"
    @click.self="close"
  >
    <aside
      class="settings fixed top-0 right-0 h-full w-[min(380px,100vw)] px-4 ui-glass overflow-clip flex flex-col"
      :aria-label="t('settings.title')"
    >
      <PanelHeader
        :title="t('settings.title')"
        :close-label="t('settings.close')"
        class="settings-header -mx-4 z-20"
        @close="close"
      />
      <div class="settings-content flex-1 min-h-0 overflow-y-auto -mx-4 px-4 py-4">
        <SyncStatus tooltip-target="#settings-modal" />
        <form class="settings-form flex flex-col flex-1 min-w-0 text-sm" @submit.prevent>
          <div class="mb-5">
            <label for="interface-language" class="block mb-2">{{
              t('settings.language.label')
            }}</label>
            <div class="ui-select">
              <select
                id="interface-language"
                :value="settings.language"
                :disabled="busy"
                :class="ui.input"
                @change="
                  updateSettings({
                    language: ($event.target as HTMLSelectElement).value as Settings['language'],
                  })
                "
              >
                <option v-for="item in languages" :key="item.id" :value="item.id">
                  {{ item.label }}
                </option></select
              ><SelectChevron />
            </div>
          </div>
          <fieldset class="mb-5 min-w-0">
            <legend class="font-bold mb-2">{{ t('settings.appearance.title') }}</legend>
            <label for="theme-mode" class="block mb-2">{{ t('settings.theme.label') }}</label>
            <div class="ui-select">
              <select
                id="theme-mode"
                :value="settings.theme"
                :disabled="busy"
                :class="ui.input"
                @change="
                  updateSettings({
                    theme: ($event.target as HTMLSelectElement).value as Settings['theme'],
                  })
                "
              >
                <option value="system">{{ t('settings.theme.system') }}</option>
                <option value="light">{{ t('settings.theme.light') }}</option>
                <option value="dark">{{ t('settings.theme.dark') }}</option></select
              ><SelectChevron />
            </div>
            <div class="mt-4" role="group" aria-labelledby="background-label">
              <p id="background-label" class="mb-2">{{ t('background.title') }}</p>
              <div class="flex justify-between items-center gap-2">
                <input
                  :aria-label="t('background.change')"
                  id="background"
                  :class="ui.fileInput"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
                  :disabled="busy || reading"
                  @change="file"
                /><label :class="ui.fileButton" for="background">{{
                  t('common.choose_file')
                }}</label>
                <button
                  v-if="hasBackground"
                  type="button"
                  class="size-8 shrink-0 inline-flex items-center justify-center rounded-[var(--ui-radius)] ui-hover"
                  :aria-label="t('background.remove')"
                  :title="t('background.remove')"
                  :disabled="busy || reading"
                  @click="track(changeBackground(null))"
                >
                  <svg
                    class="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
                  </svg>
                </button>
              </div>
              <p v-if="reading" role="status" class="mt-2">
                {{ t('background.status.processing') }}
              </p>
            </div>
          </fieldset>
          <fieldset class="mb-5 min-w-0">
            <legend class="font-bold mb-2">{{ t('bookmarks.title') }}</legend>
            <label for="bookmark-folder" class="block mb-2">{{
              t('settings.bookmarks.folder')
            }}</label>
            <div class="ui-select mb-3">
              <select
                id="bookmark-folder"
                :value="selectedFolder"
                :title="selectedChoice?.path"
                class="ui-control w-full min-w-0 max-w-full p-2 text-base truncate"
                :disabled="busy || folderLoading || !!folderError"
                @change="folderChanged"
              >
                <option v-if="selectedFolder && !selectedChoice" :value="selectedFolder" disabled>
                  {{
                    folderLoading
                      ? t('folders.status.loading')
                      : t('folders.status.selected_unavailable')
                  }}
                </option>
                <option
                  v-for="choice in folders"
                  :key="choice.id"
                  :value="choice.id"
                  :title="choice.path"
                >
                  {{ choice.path }}
                </option></select
              ><SelectChevron />
            </div>
            <p v-if="syncState?.folder" class="mb-3 text-sm" role="status">
              {{ formatMessage(syncState.folder) }}
            </p>
            <p v-if="folderLoading" role="status">{{ t('folders.status.loading') }}</p>
            <p v-if="folderError" role="alert" class="text-red-800">
              {{ formatMessage(folderError) }}
              <button type="button" @click="loadFolders">{{ t('common.retry') }}</button>
            </p>
            <SwitchControl
              v-for="field in switchFields"
              :key="field.key"
              :model-value="settings[field.key]"
              :disabled="busy"
              class="settings-row mb-3"
              @update:model-value="(value) => updateSettings({ [field.key]: value })"
              >{{ field.label }}</SwitchControl
            >
          </fieldset>
          <fieldset class="mb-5 min-w-0">
            <legend class="font-bold mb-2">{{ t('settings.grid.title') }}</legend>
            <div v-for="field in numberFields" :key="field.key" class="mb-3">
              <label class="settings-row flex justify-between items-center gap-2"
                >{{ field.label
                }}<input
                  :aria-label="field.label"
                  :value="values[field.key]"
                  class="input settings-number"
                  :class="ui.input"
                  type="number"
                  :min="field.min"
                  :max="field.max"
                  :disabled="busy"
                  :aria-invalid="!!inputErrors[field.key]"
                  :aria-describedby="
                    inputErrors[field.key] ? 'settings-' + field.key + '-error' : undefined
                  "
                  @focus="focused = field.key"
                  @input="input(field.key, $event)"
                  @change="flushField(field.key, true)"
                  @blur="
                    focused = undefined;
                    flushField(field.key, true);
                  "
              /></label>
              <p
                v-if="inputErrors[field.key]"
                :id="'settings-' + field.key + '-error'"
                role="alert"
                class="mt-1 text-red-800"
              >
                {{ formatMessage(inputErrors[field.key]) }}
              </p>
            </div>
            <SwitchControl
              :model-value="settings.verticalCenter"
              :disabled="busy"
              class="settings-row"
              @update:model-value="(value) => updateSettings({ verticalCenter: value })"
              >{{ t('settings.grid.vertical_center') }}</SwitchControl
            >
          </fieldset>
          <fieldset class="mb-5 min-w-0">
            <legend class="font-bold mb-2">
              {{ t('settings.mail.title') }}
              <InfoTooltip
                target="#settings-modal"
                id="mail-settings-info"
                :label="t('settings.mail.help_label')"
                >{{ t('settings.mail.help') }}</InfoTooltip
              >
            </legend>
            <SwitchControl
              :model-value="settings.mailruEnabled"
              :disabled="busy"
              class="settings-row"
              @update:model-value="(value) => updateSettings({ mailruEnabled: value })"
              >{{ t('settings.mail.mailru') }}</SwitchControl
            >
            <SwitchControl
              :model-value="settings.gmailEnabled"
              :disabled="busy"
              class="settings-row"
              @update:model-value="(value) => updateSettings({ gmailEnabled: value })"
              >{{ t('settings.mail.gmail') }}</SwitchControl
            >
            <SwitchControl
              :model-value="settings.yandexMailEnabled"
              :disabled="busy"
              class="settings-row"
              @update:model-value="(value) => updateSettings({ yandexMailEnabled: value })"
              >{{ t('settings.mail.yandex') }}</SwitchControl
            >
          </fieldset>
          <fieldset class="mb-5 min-w-0 weather-settings">
            <legend class="font-bold mb-2">{{ t('weather.title') }}</legend>
            <SwitchControl
              :model-value="settings.weatherEnabled"
              :disabled="busy"
              class="settings-row"
              @update:model-value="(value) => updateSettings({ weatherEnabled: value })"
              >{{ t('settings.weather.enabled') }}</SwitchControl
            >
            <div v-if="settings.weatherEnabled" class="mt-3">
              <label for="weather-city" class="block mb-2">{{ t('settings.weather.city') }}</label>
              <div class="ui-select mb-3">
                <select
                  id="weather-city"
                  :value="settings.weatherCity"
                  :disabled="busy"
                  :class="ui.input"
                  @change="
                    updateSettings({
                      weatherCity: ($event.target as HTMLSelectElement)
                        .value as Settings['weatherCity'],
                    })
                  "
                >
                  <option v-for="city in weatherCities" :key="city.id" :value="city.id">
                    {{ city.label }}
                  </option></select
                ><SelectChevron />
              </div>
              <label for="weather-provider" class="block mb-2">{{
                t('settings.weather.provider')
              }}</label>
              <div class="ui-select">
                <select
                  id="weather-provider"
                  :value="settings.weatherProvider"
                  :disabled="busy"
                  :class="ui.input"
                  @change="
                    updateSettings({
                      weatherProvider: ($event.target as HTMLSelectElement)
                        .value as Settings['weatherProvider'],
                    })
                  "
                >
                  <option
                    v-for="provider in weatherProviders"
                    :key="provider.id"
                    :value="provider.id"
                  >
                    {{ provider.label }}
                  </option></select
                ><SelectChevron />
              </div>
            </div>
          </fieldset>
          <p v-if="error || operationError" role="alert" class="mb-3 text-red-800 break-words">
            {{ formatMessage(error || operationError) }}
          </p>
          <fieldset class="settings-bottom mt-auto min-w-0">
            <legend class="font-bold mb-2">{{ t('settings.data.title') }}</legend>
            <button
              type="button"
              class="button secondary w-full"
              :class="ui.button"
              :disabled="busy || reading"
              @click="action"
            >
              <span class="ui-action-label">{{ t('backup.title') }}</span>
            </button>
          </fieldset>
        </form>
      </div>
    </aside>
  </dialog>
</template>
