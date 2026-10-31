<script setup lang="ts">
import {
  t,
  formatMessage,
  joinMessages,
  message,
  LocalizedError,
  errorMessage,
  type MessageText,
} from '../../../../../services/i18n';
import { computed, nextTick, onMounted, ref, shallowRef } from 'vue';
import ModalDialog from '../../../../../components/ModalDialog.vue';
import SelectChevron from '../../../../../components/SelectChevron.vue';
import { folderOptionLabels } from '../../../../../services/bookmarks';
import { ui } from '../../../../../utils/ui';
import { backupLimits, parseImport, validateImportImages } from '../adapters/json';
import { downloadExport } from '../adapters/download';
import { allBackupSections, type BackupSelection } from '../../../../../types/models';
import type {
  FolderChoice,
  ImportData,
  ImportReport,
  PreparedExport,
  Settings,
} from '../../../../../types/models';
const props = defineProps<{
  rootId: string | null;
  settings: Settings;
  choices: () => Promise<FolderChoice[]>;
  prepareExport: () => Promise<PreparedExport>;
  exportData: (
    selection: BackupSelection,
    prepared: PreparedExport,
  ) => Promise<{ text: string; warnings: MessageText[] }>;
  importData: (
    data: ImportData,
    id: string,
    expected: Settings,
    selection: BackupSelection,
  ) => Promise<ImportReport>;
  resetData: () => Promise<void>;
}>();
const emit = defineEmits<{ close: [] }>();
const stage = ref<'home' | 'export' | 'import' | 'reset' | 'result'>('home'),
  busy = ref(false),
  status = ref<MessageText>(''),
  error = ref<MessageText>(''),
  folderError = ref<MessageText>('');
const result = shallowRef<{
  title: MessageText;
  warning: boolean;
  summary?: MessageText;
  stats?: Pick<ImportReport, 'bookmarks' | 'folders' | 'images'>;
}>();
const resultStats = computed(() =>
  [
    {
      get label() {
        return t('bookmarks.title');
      },
      value: result.value?.stats?.bookmarks ?? 0,
    },
    {
      get label() {
        return t('folders.title');
      },
      value: result.value?.stats?.folders ?? 0,
    },
    {
      get label() {
        return t('images.title');
      },
      value: result.value?.stats?.images ?? 0,
    },
  ].filter((row) => row.value > 0),
);
const done = ref<HTMLButtonElement>();
const fileInput = ref<HTMLInputElement>(),
  heading = ref<HTMLElement>(),
  homeAction = ref<HTMLButtonElement>();
const folders = ref<FolderChoice[]>([]),
  destination = ref(props.rootId ?? '');
const prepared = shallowRef<PreparedExport>();
const transferData = computed(() => (stage.value === 'export' ? prepared.value?.data : data.value));
const data = shallowRef<ImportData>(),
  expected = shallowRef<Settings>();
const folderLabels = computed(() => folderOptionLabels(folders.value));
const selection = ref<BackupSelection>({ ...allBackupSections });
const options = [
  {
    key: 'bookmarks',
    get label() {
      return t('backup.sections.bookmarks_and_folders');
    },
  },
  {
    key: 'images',
    get label() {
      return t('backup.sections.bookmark_images');
    },
  },
  {
    key: 'settings',
    get label() {
      return t('settings.title');
    },
  },
  {
    key: 'background',
    get label() {
      return t('background.title');
    },
  },
] as const;
const available = computed<BackupSelection>(() =>
  stage.value === 'export'
    ? { ...allBackupSections }
    : {
        bookmarks: data.value?.bookmarks !== false,
        images: rows.value.some((row) => row.thumbnail || row.favicon),
        settings: !!data.value?.settings,
        background: data.value?.background !== undefined,
      },
);
const hasSelection = computed(() =>
  options.some((row) => selection.value[row.key] && available.value[row.key]),
);
const needsDestination = computed(() => selection.value.bookmarks || selection.value.images);
const appliedMessage = (report: ImportReport) =>
  report.settings && report.background
    ? message('backup.result.settings_and_background_applied')
    : report.settings
      ? message('backup.result.settings_applied')
      : report.background
        ? message('backup.result.background_applied')
        : '';
async function chooseExport() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  status.value = '';
  try {
    prepared.value = await props.prepareExport();
    selection.value = { ...allBackupSections };
    stage.value = 'export';
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    busy.value = false;
    await focus();
  }
}
const rows = computed(
  () => transferData.value?.entries.flatMap((row) => ('url' in row ? [row] : row.children)) ?? [],
);
const counts = computed(() => ({
  bookmarks: rows.value.length,
  folders: transferData.value?.entries.filter((row) => !('url' in row)).length ?? 0,
  thumbnails: rows.value.filter((row) => row.thumbnail).length,
  favicons: rows.value.filter((row) => row.favicon).length,
}));
async function loadFolders() {
  try {
    folders.value = await props.choices();
    folderError.value = '';
    if (!folders.value.some((row) => row.id === destination.value))
      destination.value = folders.value[0]?.id ?? '';
  } catch {
    folderError.value = message('backup.import.errors.load_destinations');
  }
}

async function focus() {
  await nextTick();
  if (stage.value === 'result') done.value?.focus();
  else heading.value?.focus();
}
function complete(
  title: MessageText,
  warning = false,
  summary?: MessageText,
  stats?: Pick<ImportReport, 'bookmarks' | 'folders' | 'images'>,
) {
  result.value = { title, warning, summary, stats };
  stage.value = 'result';
}
async function back() {
  if (busy.value) return;
  stage.value = 'home';
  data.value = undefined;
  prepared.value = undefined;
  result.value = undefined;
  error.value = '';
  status.value = '';
  await nextTick();
  homeAction.value?.focus();
}
async function exportFile() {
  if (busy.value || !hasSelection.value || !prepared.value) return;
  busy.value = true;
  error.value = '';
  status.value = message('backup.export.status.creating');
  try {
    const backup = await props.exportData({ ...selection.value }, prepared.value);
    downloadExport(backup.text);
    status.value = message('backup.export.status.complete_with_download');
    const exported = JSON.parse(backup.text),
      rows = exported.entries.flatMap(
        (row: { url?: string; children?: Array<{ thumbnail?: string; favicon?: string }> }) =>
          row.url ? [row] : (row.children ?? []),
      );
    const stats = {
      bookmarks: selection.value.bookmarks ? rows.length : 0,
      folders: selection.value.bookmarks
        ? exported.entries.filter((row: { url?: string }) => !row.url).length
        : 0,
      images: rows.reduce(
        (sum: number, row: { thumbnail?: string; favicon?: string }) =>
          sum + Number(!!row.thumbnail) + Number(!!row.favicon),
        0,
      ),
    };
    status.value = joinMessages([
      stats.bookmarks ? message('backup.export.result.bookmarks', { count: stats.bookmarks }) : '',
      stats.folders ? message('backup.export.result.folders', { count: stats.folders }) : '',
      stats.images ? message('backup.export.result.images', { count: stats.images }) : '',
      exported.settings ? message('backup.export.result.settings_included') : '',
      Object.hasOwn(exported, 'background')
        ? message('backup.export.result.background_included')
        : '',
      message('backup.export.result.download_started'),
    ]);
    if (backup.warnings.length)
      error.value = joinMessages([
        ...backup.warnings.slice(0, 3),
        backup.warnings.length > 3
          ? message('backup.result.warning_count', { count: backup.warnings.length })
          : '',
      ]);
    complete(
      backup.warnings.length
        ? message('backup.export.result.with_warnings')
        : message('backup.export.result.complete'),
      !!backup.warnings.length,
      message('backup.export.result.download_started'),
      stats,
    );
  } catch (cause) {
    status.value = '';
    error.value = errorMessage(cause);
  } finally {
    busy.value = false;
    await focus();
  }
}
async function read(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = '';
  if (!file || busy.value) return;
  busy.value = true;
  error.value = '';
  status.value = '';
  try {
    if (file.size > backupLimits.file)
      throw new LocalizedError(message('backup.errors.file_too_large'));
    const parsed = parseImport(await file.text());
    await validateImportImages(parsed);
    await loadFolders();
    data.value = parsed;
    expected.value = { ...props.settings };
    stage.value = 'import';
    selection.value = { ...available.value };
    if (!hasSelection.value) {
      stage.value = 'home';
      throw new LocalizedError(message('backup.import.errors.no_data'));
    }
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    busy.value = false;
    await focus();
  }
}
async function importFile() {
  if (
    busy.value ||
    !data.value ||
    !hasSelection.value ||
    (needsDestination.value && (!destination.value || !!folderError.value)) ||
    !expected.value
  )
    return;
  busy.value = true;
  error.value = '';
  status.value = message('backup.import.status.importing');
  try {
    const report = await props.importData(data.value, destination.value, expected.value, {
      ...selection.value,
    });
    status.value = joinMessages([
      report.bookmarks
        ? message('backup.import.result.bookmarks', { count: report.bookmarks })
        : '',
      report.folders ? message('backup.import.result.folders', { count: report.folders }) : '',
      report.images ? message('backup.import.result.images', { count: report.images }) : '',
      appliedMessage(report),
      report.skipped
        ? message('backup.import.result.unmatched_bookmarks', { count: report.skipped })
        : '',
    ]);
    if (report.error || report.warnings.length)
      error.value = message('backup.import.result.partial_data_kept', {
        error: joinMessages([report.error, ...report.warnings.slice(0, 3)]),
      });
    complete(
      report.error
        ? message('backup.import.result.interrupted')
        : report.warnings.length
          ? message('backup.import.result.with_warnings')
          : message('backup.import.result.complete'),
      !!report.error || !!report.warnings.length,
      report.error
        ? report.bookmarks || report.folders || report.images
          ? message('backup.import.result.some_data_restored')
          : message('backup.import.result.no_data_added')
        : joinMessages([
            report.warnings.length ? message('backup.import.result.some_data_failed') : '',
            appliedMessage(report),
            report.skipped
              ? message('backup.import.result.unmatched_bookmarks', { count: report.skipped })
              : '',
          ]) ||
            (report.images || report.bookmarks || report.folders
              ? message('backup.import.result.selected_data_restored')
              : message('backup.import.result.no_new_data')),
      { bookmarks: report.bookmarks, folders: report.folders, images: report.images },
    );
    data.value = undefined;
  } catch (cause) {
    status.value = '';
    error.value = errorMessage(cause);
  } finally {
    busy.value = false;
    await focus();
  }
}
async function reset() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  status.value = message('backup.reset.status.resetting');
  try {
    await props.resetData();
    status.value = message('backup.reset.result.full_summary');
    complete(
      message('backup.reset.result.complete'),
      false,
      message('backup.reset.result.summary'),
    );
  } catch (cause) {
    status.value = '';
    error.value = message('backup.reset.errors.partial_failure', { error: errorMessage(cause) });
    complete(message('backup.reset.result.incomplete'), true);
  } finally {
    busy.value = false;
    await focus();
  }
}
defineExpose({
  close: () => {
    if (!busy.value) emit('close');
  },
});
onMounted(loadFolders);
</script>
<template>
  <ModalDialog :title="t('backup.title')" :busy="busy" wide @close="emit('close')">
    <div class="data-management flex flex-col gap-4 [overflow-wrap:anywhere]">
      <input
        ref="fileInput"
        class="hidden"
        type="file"
        accept=".json,application/json"
        :aria-label="t('backup.file.label')"
        @change="read"
      />
      <template v-if="stage === 'home'">
        <button
          ref="homeAction"
          :aria-label="t('backup.export.title')"
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
            ><strong>{{ t('backup.export.title') }}</strong
            ><span class="text-[var(--text-secondary)]">{{
              t('backup.export.description')
            }}</span></span
          >
        </button>
        <button
          :aria-label="t('backup.import.title')"
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
            ><strong>{{ t('backup.import.title') }}</strong
            ><span class="text-[var(--text-secondary)]">{{
              t('backup.import.description')
            }}</span></span
          >
        </button>
        <p v-if="folderError || !folders.length" class="text-[var(--text-secondary)] text-sm">
          {{ formatMessage(folderError) || t('backup.import.folder_required_for_images') }}
        </p>
        <div class="border-t border-[var(--ui-border)] pt-4">
          <button
            :aria-label="t('backup.reset.title')"
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
              ><strong>{{ t('backup.reset.title') }}</strong
              ><span class="text-[var(--text-secondary)]">{{
                t('backup.reset.bookmarks_kept')
              }}</span></span
            >
          </button>
        </div>
      </template>
      <template v-else-if="stage === 'export'">
        <h3 ref="heading" tabindex="-1" class="font-semibold outline-none">
          {{ t('backup.export.preview.title') }}
        </h3>
        <fieldset class="backup-options export-summary" :disabled="busy">
          <legend class="sr-only">{{ t('backup.export.preview.selection_label') }}</legend>
          <label v-for="option in options" :key="option.key" class="backup-option"
            ><input v-model="selection[option.key]" type="checkbox" /><span
              >{{ option.label
              }}<span v-if="option.key === 'bookmarks'" class="backup-detail"
                >{{ t('backup.preview.bookmarks') }} {{ counts.bookmarks }}
                {{ t('backup.preview.folders') }} {{ counts.folders }}</span
              ><span v-else-if="option.key === 'images'" class="backup-detail"
                >{{ t('backup.preview.thumbnails') }} {{ counts.thumbnails }}
                {{ t('backup.preview.favicons') }} {{ counts.favicons }}</span
              ><span
                v-else-if="option.key === 'background' && !prepared?.data.background"
                class="backup-detail"
                >{{ t('background.none') }}</span
              ></span
            ></label
          >
        </fieldset>
        <p
          v-if="selection.images && !selection.bookmarks"
          class="text-[var(--text-secondary)] text-sm"
        >
          {{ t('backup.images_only.description') }}
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="secondary flex-1 whitespace-nowrap"
            :class="ui.button"
            :disabled="busy"
            @click="back"
          >
            {{ t('common.back') }}</button
          ><button
            type="button"
            class="flex-1 whitespace-nowrap"
            :class="ui.button"
            :disabled="busy || !hasSelection"
            @click="exportFile"
          >
            {{ t('backup.export.action') }}
          </button>
        </div>
      </template>
      <template v-else-if="stage === 'import' && data">
        <h3 ref="heading" tabindex="-1" class="font-semibold outline-none">
          {{ t('backup.import.preview.title') }}
        </h3>
        <fieldset class="backup-options import-summary" :disabled="busy">
          <legend class="sr-only">{{ t('backup.import.preview.selection_label') }}</legend>
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
                t('backup.preview.not_in_file')
              }}</span
              ><span v-else-if="option.key === 'bookmarks'" class="backup-detail"
                >{{ t('backup.preview.bookmarks') }} {{ counts.bookmarks }}
                {{ t('backup.preview.folders') }} {{ counts.folders }}</span
              ><span v-else-if="option.key === 'images'" class="backup-detail"
                >{{ t('backup.preview.thumbnails') }} {{ counts.thumbnails }}
                {{ t('backup.preview.favicons') }} {{ counts.favicons }}</span
              ><span
                v-else-if="option.key === 'background' && !data.background"
                class="backup-detail"
                >{{ t('background.none') }}</span
              ></span
            >
          </label>
        </fieldset>
        <p
          v-if="needsDestination && (folderError || !folders.length)"
          role="alert"
          class="text-[var(--danger)] text-sm"
        >
          {{ formatMessage(folderError) || t('backup.import.folder_required') }}
        </p>
        <label v-if="needsDestination" for="import-destination">{{
          selection.bookmarks
            ? t('backup.import.destination.add')
            : t('backup.import.destination.find')
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
            {{ t('common.back') }}</button
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
            {{ t('backup.import.action') }}
          </button>
        </div>
      </template>
      <template v-else-if="stage === 'reset'">
        <h3 ref="heading" tabindex="-1" class="font-semibold outline-none">
          {{ t('backup.reset.confirmation.title') }}
        </h3>
        <p>{{ t('backup.reset.confirmation.description') }}</p>
        <p class="text-[var(--text-secondary)] text-sm">
          {{ t('backup.reset.confirmation.sync_warning') }}
        </p>
        <div class="flex gap-2">
          <button type="button" class="flex-1" :class="ui.button" :disabled="busy" @click="back">
            {{ t('common.cancel') }}</button
          ><button
            type="button"
            class="danger flex-1"
            :class="ui.button"
            :disabled="busy"
            @click="reset"
          >
            {{ t('backup.reset.action') }}
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
          {{ t('common.done') }}
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
<style scoped>
.backup-options {
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.backup-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  cursor: pointer;
}
.backup-option + .backup-option {
  border-top: 1px solid var(--ui-border);
}
.backup-option:has(input:disabled) {
  cursor: default;
}
.backup-option input {
  width: 20px;
  height: 20px;
  flex: none;
  accent-color: var(--ui-accent);
}
.backup-detail {
  display: block;
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.data-action {
  display: flex;
  align-items: center;
  gap: 14px;
  text-align: left;
  padding: 14px;
  min-width: 0;
}
.data-action > svg {
  width: 24px;
  height: 24px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.data-action > span {
  min-width: 0;
}
.data-action strong {
  display: block;
  font-weight: 500;
}
.data-action span span {
  display: block;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.4;
  margin-top: 3px;
}
.result-symbol {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  color: var(--success);
}
.result-symbol svg {
  width: 28px;
  height: 28px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.data-result[data-warning] .result-symbol {
  color: var(--ui-text);
}
.result-stats {
  grid-template-columns: repeat(var(--result-columns), minmax(0, 1fr));
  background: var(--surface-input);
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-action);
  padding: 12px 0;
}
.result-stats > div {
  min-width: 0;
  padding: 0 4px;
  display: flex;
  flex-direction: column-reverse;
  gap: 4px;
}
.result-stats > div + div {
  border-left: 1px solid var(--ui-border);
}
.result-stats dt {
  font-size: 12px;
  color: var(--text-secondary);
}
.result-stats dd {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.result-warning {
  border-top: 1px solid var(--ui-border);
  padding-top: 16px;
  color: var(--ui-text);
}
@media (max-width: 360px) {
  .result-stats {
    grid-template-columns: 1fr;
    padding: 4px 12px;
  }
  .result-stats > div {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    gap: 12px;
  }
  .result-stats > div + div {
    border-left: 0;
    border-top: 1px solid var(--ui-border);
  }
  .result-stats dt {
    font-size: 14px;
  }
  .result-stats dd {
    font-size: 18px;
  }
}
</style>
