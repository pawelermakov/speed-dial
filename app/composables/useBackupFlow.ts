import { message } from '../common/i18n/messages';
import { LocalizedError } from '../common/i18n/errors';
import { type MessageText } from '../common/i18n/contracts';
import { ref, shallowRef, onUnmounted } from 'vue';
import type { DataManagementDialog as DataManagementDialogComponent } from '../modules/backup/components';
import type {
  BackupSelection,
  ImportData,
  ImportReport,
  PreparedExport,
  IBackupService,
} from '../modules/backup';
import type { Settings } from '../modules/settings';
import type { DialState } from './screenTypes';
import type { DataLock } from '../common/infrastructure/browser/interfaces';
import type { IBookmarksSource } from '../modules/bookmarks';
import type { Ref } from 'vue';

export function useBackupFlow({
  backup,
  source,
  lock: withDataLock,
  run,
  notice,
  flushSettings,
  disabled,
  settingsOpen,
  restoreDialogFocus,
  forgetDialogFocus,
}: Pick<DialState, 'run' | 'notice' | 'flushSettings'> & {
  backup: {
    service(): Promise<IBackupService>;
    view(): Promise<typeof import('../modules/backup/newtab')>;
  };
  source: Pick<IBookmarksSource, 'choices'>;
  lock: DataLock;
  disabled: Readonly<Ref<boolean>>;
  settingsOpen: Ref<boolean>;
  restoreDialogFocus(element: Element): void;
  forgetDialogFocus(element: Element): void;
}) {
  const DataManagementDialog = shallowRef<typeof DataManagementDialogComponent>();
  const openingData = ref(false);
  const mailRevision = ref(0);
  const dataOpen = ref(false);
  const dataDialog = ref<InstanceType<typeof DataManagementDialogComponent>>();
  const dataChoices = () => source.choices();
  async function prepareBackup(): Promise<PreparedExport> {
    await flushSettings();
    const warnings: MessageText[] = [];
    const data = await withDataLock(async () =>
      (await backup.service()).exportData((message) => warnings.push(message)),
    );
    return { data, warnings };
  }
  async function exportBackup(selection: BackupSelection, prepared: PreparedExport) {
    const { selectExport, serializeExport } = await backup.view();
    const warnings = selection.bookmarks || selection.images ? [...prepared.warnings] : [];
    const text = await withDataLock(() =>
      serializeExport(selectExport(prepared.data, selection), (message) => warnings.push(message)),
    );
    return { text, warnings };
  }
  async function importBackup(
    data: ImportData,
    id: string,
    expected: Settings,
    selection: BackupSelection,
  ): Promise<ImportReport> {
    let report: ImportReport | undefined;
    if (
      !(await run(async () => {
        report = await (await backup.service()).importData(data, id, expected, selection);
      }, true))
    )
      throw new LocalizedError(notice.value || message('backup.import.errors.start_failed'));
    mailRevision.value++;
    return report!;
  }
  async function resetData() {
    if (!(await run(async () => (await backup.service()).reset(), true)))
      throw new LocalizedError(notice.value || message('backup.reset.errors.finish_failed'));
  }
  const loadingDataUI = ref(false);
  let isDisposed = false;
  onUnmounted(() => {
    isDisposed = true;
  });
  async function openDataManagement() {
    if (disabled.value || !settingsOpen.value || openingData.value || loadingDataUI.value) return;
    loadingDataUI.value = true;
    try {
      const view = await backup.view();
      if (isDisposed || !settingsOpen.value) return;
      DataManagementDialog.value = view.Dialog;
      openingData.value = true;
      settingsOpen.value = false;
    } catch {
      if (!isDisposed) notice.value = message('backup.errors.load_failed');
    } finally {
      loadingDataUI.value = false;
    }
  }
  function afterSettingsLeave(element: Element) {
    if (openingData.value) {
      forgetDialogFocus(element);
      dataOpen.value = true;
      openingData.value = false;
    } else restoreDialogFocus(element);
  }

  return {
    DataManagementDialog,
    mailRevision,
    dataOpen,
    dataDialog,
    openingData,
    dataChoices,
    prepareBackup,
    exportBackup,
    importBackup,
    resetData,
    openDataManagement,
    afterSettingsLeave,
  };
}
