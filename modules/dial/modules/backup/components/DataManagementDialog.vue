<script setup lang="ts">
import { useUiI18n } from '../../../../../shared/i18n';

import ModalDialog from '../../../../../components/ModalDialog.vue';
import SelectChevron from '../../../../../components/SelectChevron.vue';
import { ui } from '../../../../../utils/ui';
import { useBackupDialog, type BackupDialogProps } from '../composables/useBackupDialog';
import { backupLimits, parseImport, validateImportImages } from '../adapters/json';
import { downloadExport } from '../adapters/download';
const { t: $t, formatMessage } = useUiI18n();

const props = defineProps<BackupDialogProps>();
const emit = defineEmits<{ close: [] }>();
const {
  focus,
  stage,
  busy,
  status,
  error,
  folderError,
  result,
  resultStats,
  done,
  fileInput,
  heading,
  homeAction,
  folders,
  destination,
  prepared,
  data,
  folderLabels,
  selection,
  options,
  available,
  hasSelection,
  needsDestination,
  chooseExport,
  counts,
  back,
  exportFile,
  read,
  importFile,
  reset,
} = useBackupDialog(props, { backupLimits, parseImport, validateImportImages, downloadExport });
defineExpose({
  close: () => {
    if (!busy.value) emit('close');
  },
});
</script>
<template>
  <ModalDialog :title="$t('backup.title')" :busy="busy" wide @close="emit('close')">
    <div class="data-management flex flex-col gap-4 [overflow-wrap:anywhere]">
      <input
        ref="fileInput"
        class="hidden"
        type="file"
        accept=".json,application/json"
        :aria-label="$t('backup.file.label')"
        @change="read"
      />
      <template v-if="stage === 'home'">
        <button
          ref="homeAction"
          :aria-label="$t('backup.export.title')"
          type="button"
          class="data-action secondary"
          :class="ui.button"
          :disabled="busy"
          @click="chooseExport"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
          </svg>
          <span
            ><strong>{{ $t('backup.export.title') }}</strong
            ><span class="text-[var(--text-secondary)]">{{
              $t('backup.export.description')
            }}</span></span
          >
        </button>
        <button
          :aria-label="$t('backup.import.title')"
          type="button"
          class="data-action secondary"
          :class="ui.button"
          :disabled="busy"
          @click="fileInput?.click()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5" />
          </svg>
          <span
            ><strong>{{ $t('backup.import.title') }}</strong
            ><span class="text-[var(--text-secondary)]">{{
              $t('backup.import.description')
            }}</span></span
          >
        </button>
        <p v-if="folderError || !folders.length" class="text-[var(--text-secondary)] text-sm">
          {{ formatMessage(folderError) || $t('backup.import.folder_required_for_images') }}
        </p>
        <div class="border-t border-[var(--ui-border)] pt-4">
          <button
            :aria-label="$t('backup.reset.title')"
            type="button"
            class="data-action danger w-full"
            :class="ui.button"
            :disabled="busy"
            @click="
              stage = 'reset';
              error = '';
              status = '';
              focus();
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
            </svg>
            <span
              ><strong>{{ $t('backup.reset.title') }}</strong
              ><span class="text-[var(--text-secondary)]">{{
                $t('backup.reset.bookmarks_kept')
              }}</span></span
            >
          </button>
        </div>
      </template>
      <template v-else-if="stage === 'export'">
        <h3 ref="heading" tabindex="-1" class="font-semibold outline-none">
          {{ $t('backup.export.preview.title') }}
        </h3>
        <fieldset class="backup-options export-summary" :disabled="busy">
          <legend class="sr-only">{{ $t('backup.export.preview.selection_label') }}</legend>
          <label v-for="option in options" :key="option.key" class="backup-option"
            ><input v-model="selection[option.key]" type="checkbox" /><span
              >{{ option.label
              }}<span v-if="option.key === 'bookmarks'" class="backup-detail"
                >{{ $t('backup.preview.bookmarks') }} {{ counts.bookmarks }}
                {{ $t('backup.preview.folders') }} {{ counts.folders }}</span
              ><span v-else-if="option.key === 'images'" class="backup-detail"
                >{{ $t('backup.preview.thumbnails') }} {{ counts.thumbnails }}
                {{ $t('backup.preview.favicons') }} {{ counts.favicons }}</span
              ><span
                v-else-if="option.key === 'background' && !prepared?.data.background"
                class="backup-detail"
                >{{ $t('background.none') }}</span
              ></span
            ></label
          >
        </fieldset>
        <p
          v-if="selection.images && !selection.bookmarks"
          class="text-[var(--text-secondary)] text-sm"
        >
          {{ $t('backup.images_only.description') }}
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="secondary flex-1 whitespace-nowrap"
            :class="ui.button"
            :disabled="busy"
            @click="back"
          >
            {{ $t('common.back') }}</button
          ><button
            type="button"
            class="flex-1 whitespace-nowrap"
            :class="ui.button"
            :disabled="busy || !hasSelection"
            @click="exportFile"
          >
            {{ $t('backup.export.action') }}
          </button>
        </div>
      </template>
      <template v-else-if="stage === 'import' && data">
        <h3 ref="heading" tabindex="-1" class="font-semibold outline-none">
          {{ $t('backup.import.preview.title') }}
        </h3>
        <fieldset class="backup-options import-summary" :disabled="busy">
          <legend class="sr-only">{{ $t('backup.import.preview.selection_label') }}</legend>
          <label
            v-for="option in options"
            :key="option.key"
            class="backup-option"
            :class="{ 'text-[var(--text-secondary)]': !available[option.key] }"
          >
            <input
              v-model="selection[option.key]"
              type="checkbox"
              :disabled="!available[option.key]"
            />
            <span
              >{{ option.label
              }}<span v-if="!available[option.key]" class="backup-detail">{{
                $t('backup.preview.not_in_file')
              }}</span
              ><span v-else-if="option.key === 'bookmarks'" class="backup-detail"
                >{{ $t('backup.preview.bookmarks') }} {{ counts.bookmarks }}
                {{ $t('backup.preview.folders') }} {{ counts.folders }}</span
              ><span v-else-if="option.key === 'images'" class="backup-detail"
                >{{ $t('backup.preview.thumbnails') }} {{ counts.thumbnails }}
                {{ $t('backup.preview.favicons') }} {{ counts.favicons }}</span
              ><span
                v-else-if="option.key === 'background' && !data.background"
                class="backup-detail"
                >{{ $t('background.none') }}</span
              ></span
            >
          </label>
        </fieldset>
        <p
          v-if="needsDestination && (folderError || !folders.length)"
          role="alert"
          class="text-[var(--danger)] text-sm"
        >
          {{ formatMessage(folderError) || $t('backup.import.folder_required') }}
        </p>
        <label v-if="needsDestination" for="import-destination">{{
          selection.bookmarks
            ? $t('backup.import.destination.add')
            : $t('backup.import.destination.find')
        }}</label>
        <div v-if="needsDestination" class="ui-select">
          <select id="import-destination" v-model="destination" :disabled="busy" :class="ui.input">
            <option v-for="row in folderLabels" :key="row.id" :value="row.id">
              {{ row.label }}
            </option></select
          ><SelectChevron />
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="secondary flex-1 whitespace-nowrap"
            :class="ui.button"
            :disabled="busy"
            @click="back"
          >
            {{ $t('common.back') }}</button
          ><button
            type="button"
            class="flex-1 whitespace-nowrap"
            :class="ui.button"
            :disabled="
              busy ||
              !hasSelection ||
              (needsDestination &&
                (!!folderError || !destination || !folders.some((row) => row.id === destination)))
            "
            @click="importFile"
          >
            {{ $t('backup.import.action') }}
          </button>
        </div>
      </template>
      <template v-else-if="stage === 'reset'">
        <h3 ref="heading" tabindex="-1" class="font-semibold outline-none">
          {{ $t('backup.reset.confirmation.title') }}
        </h3>
        <p>{{ $t('backup.reset.confirmation.description') }}</p>
        <p class="text-[var(--text-secondary)] text-sm">
          {{ $t('backup.reset.confirmation.sync_warning') }}
        </p>
        <div class="flex gap-2">
          <button type="button" class="flex-1" :class="ui.button" :disabled="busy" @click="back">
            {{ $t('common.cancel') }}</button
          ><button
            type="button"
            class="danger flex-1"
            :class="ui.button"
            :disabled="busy"
            @click="reset"
          >
            {{ $t('backup.reset.action') }}
          </button>
        </div>
      </template>
      <template v-else-if="result">
        <div class="data-result text-center" :data-warning="result.warning || undefined">
          <div class="result-symbol mx-auto mb-4" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path v-if="result.warning" d="M12 7v6m0 4h.01" />
              <path v-else d="m6 12 4 4 8-8" />
            </svg>
          </div>
          <h3 class="text-xl font-semibold leading-tight">{{ formatMessage(result.title) }}</h3>
          <p
            v-if="status || result.summary"
            role="status"
            aria-live="polite"
            class="mt-2 text-[var(--text-secondary)] text-sm"
          >
            <span :class="{ 'sr-only': !!result.summary }">{{
              formatMessage(status || result.summary)
            }}</span
            ><span v-if="result.summary" aria-hidden="true">{{
              formatMessage(result.summary)
            }}</span>
          </p>
          <dl
            v-if="resultStats.length"
            class="result-stats grid mt-5"
            :style="{ '--result-columns': resultStats.length }"
            aria-hidden="true"
          >
            <div v-for="row in resultStats" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>
          <p v-if="error" role="alert" class="result-warning mt-4 text-left text-sm">
            {{ formatMessage(error) }}
          </p>
        </div>
        <button ref="done" type="button" class="mt-1" :class="ui.button" @click="emit('close')">
          {{ $t('common.done') }}
        </button>
      </template>
      <p
        v-if="stage !== 'result' && status"
        role="status"
        aria-live="polite"
        class="text-[var(--text-secondary)] text-sm"
      >
        {{ formatMessage(status) }}
      </p>
      <p v-if="stage !== 'result' && error" role="alert" class="text-[var(--danger)] text-sm">
        {{ formatMessage(error) }}
      </p>
    </div>
  </ModalDialog>
</template>
<style scoped src="../styles/data-management.css" />
