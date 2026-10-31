<script setup lang="ts">
import { useUiI18n } from '../shared/i18n';
import { type MessageText } from '../shared/i18n/contracts';
import type { Settings } from '../modules/dial/modules/settings';
import SelectChevron from './SelectChevron.vue';
import SwitchControl from './SwitchControl.vue';
import InfoTooltip from './InfoTooltip.vue';
import PanelHeader from './PanelHeader.vue';
import SyncStatus from './SyncStatus.vue';
import { cycleDialogFocus } from '../utils/keyboard';
import { ui } from '../utils/ui';
import WeatherSettings from '../modules/dial/modules/weather/components/WeatherSettings.vue';
import {
  useSettingsForm,
  type SettingsFormProps,
} from '../modules/dial/modules/settings/composables/useSettingsForm';
const { t: $t, formatMessage, languages } = useUiI18n();

const props = defineProps<SettingsFormProps>();
const emit = defineEmits<{ close: []; manage: []; error: [message: MessageText] }>();
const {
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
} = useSettingsForm(props, emit);
defineExpose({ flush });
</script>
<template>
  <dialog
    id="settings-modal"
    ref="settingsDialog"
    class="settings-overlay ui-overlay fixed inset-0 z-20 w-full h-full max-w-none max-h-none m-0 border-0 p-0 text-[var(--ui-text)] backdrop:bg-transparent"
    :aria-label="$t('settings.title')"
    aria-modal="true"
    @keydown.tab="cycleDialogFocus($event, settingsDialog)"
    @cancel.prevent.stop="close"
    @click.self="close"
  >
    <aside
      class="settings fixed top-0 right-0 h-full w-[min(380px,100vw)] px-4 ui-glass overflow-clip flex flex-col"
      :aria-label="$t('settings.title')"
    >
      <PanelHeader
        :title="$t('settings.title')"
        :close-label="$t('settings.close')"
        class="settings-header -mx-4 z-20"
        @close="close"
      />
      <div class="settings-content flex-1 min-h-0 overflow-y-auto -mx-4 px-4 py-4">
        <SyncStatus tooltip-target="#settings-modal" />
        <form class="settings-form flex flex-col flex-1 min-w-0 text-sm" @submit.prevent>
          <div class="mb-5">
            <label for="interface-language" class="block mb-2">{{
              $t('settings.language.label')
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
            <legend class="font-bold mb-2">{{ $t('settings.appearance.title') }}</legend>
            <label for="theme-mode" class="block mb-2">{{ $t('settings.theme.label') }}</label>
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
                <option value="system">{{ $t('settings.theme.system') }}</option>
                <option value="light">{{ $t('settings.theme.light') }}</option>
                <option value="dark">{{ $t('settings.theme.dark') }}</option></select
              ><SelectChevron />
            </div>
            <div class="mt-4" role="group" aria-labelledby="background-label">
              <p id="background-label" class="mb-2">{{ $t('background.title') }}</p>
              <div class="flex justify-between items-center gap-2">
                <input
                  :aria-label="$t('background.change')"
                  id="background"
                  :class="ui.fileInput"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
                  :disabled="busy || reading"
                  @change="file"
                /><label :class="ui.fileButton" for="background">{{
                  $t('common.choose_file')
                }}</label>
                <button
                  v-if="hasBackground"
                  type="button"
                  class="size-8 shrink-0 inline-flex items-center justify-center rounded-[var(--ui-radius)] ui-hover"
                  :aria-label="$t('background.remove')"
                  :title="$t('background.remove')"
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
                {{ $t('background.status.processing') }}
              </p>
            </div>
          </fieldset>
          <fieldset class="mb-5 min-w-0">
            <legend class="font-bold mb-2">{{ $t('bookmarks.title') }}</legend>
            <label for="bookmark-folder" class="block mb-2">{{
              $t('settings.bookmarks.folder')
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
                      ? $t('folders.status.loading')
                      : $t('folders.status.selected_unavailable')
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
            <p v-if="folderLoading" role="status">{{ $t('folders.status.loading') }}</p>
            <p v-if="folderError" role="alert" class="text-red-800">
              {{ formatMessage(folderError) }}
              <button type="button" @click="loadFolders">{{ $t('common.retry') }}</button>
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
            <legend class="font-bold mb-2">{{ $t('settings.grid.title') }}</legend>
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
              >{{ $t('settings.grid.vertical_center') }}</SwitchControl
            >
          </fieldset>
          <fieldset class="mb-5 min-w-0">
            <legend class="font-bold mb-2">
              {{ $t('settings.mail.title') }}
              <InfoTooltip
                target="#settings-modal"
                id="mail-settings-info"
                :label="$t('settings.mail.help_label')"
                >{{ $t('settings.mail.help') }}</InfoTooltip
              >
            </legend>
            <SwitchControl
              :model-value="settings.mailruEnabled"
              :disabled="busy"
              class="settings-row"
              @update:model-value="(value) => updateSettings({ mailruEnabled: value })"
              >{{ $t('settings.mail.mailru') }}</SwitchControl
            >
            <SwitchControl
              :model-value="settings.gmailEnabled"
              :disabled="busy"
              class="settings-row"
              @update:model-value="(value) => updateSettings({ gmailEnabled: value })"
              >{{ $t('settings.mail.gmail') }}</SwitchControl
            >
            <SwitchControl
              :model-value="settings.yandexMailEnabled"
              :disabled="busy"
              class="settings-row"
              @update:model-value="(value) => updateSettings({ yandexMailEnabled: value })"
              >{{ $t('settings.mail.yandex') }}</SwitchControl
            >
          </fieldset>
          <WeatherSettings :settings="settings" :busy="busy" :update-settings="updateSettings" />
          <p v-if="error || operationError" role="alert" class="mb-3 text-red-800 break-words">
            {{ formatMessage(error || operationError) }}
          </p>
          <fieldset class="settings-bottom mt-auto min-w-0">
            <legend class="font-bold mb-2">{{ $t('settings.data.title') }}</legend>
            <button
              type="button"
              class="button secondary w-full"
              :class="ui.button"
              :disabled="busy || reading"
              @click="action"
            >
              <span class="ui-action-label">{{ $t('backup.title') }}</span>
            </button>
          </fieldset>
        </form>
      </div>
    </aside>
  </dialog>
</template>
