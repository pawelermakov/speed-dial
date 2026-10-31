import { message, LocalizedError, type MessageText } from '../../../services/i18n';
import { ref, shallowRef, onUnmounted } from 'vue';
import type DataManagementDialogComponent from '../../../modules/dial/modules/backup/components/DataManagementDialog.vue';
import type {
  BackupSelection,
  ImportData,
  ImportReport,
  PreparedExport,
  Settings,
} from '../../../types/models';
import type { DialState, ScreenServices } from '../screenTypes';
import type { Ref } from 'vue';

export function useBackupFlow({
  services,
  repository,
  lock: withDataLock,
  run,
  notice,
  flushSettings,
  disabled,
  settingsOpen,
  restoreDialogFocus,
  forgetDialogFocus,
}: Pick<DialState, 'run' | 'notice' | 'flushSettings'> & {
  services: ScreenServices;
  repository: ScreenServices['repository'];
  lock: ScreenServices['lock'];
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
  const dataChoices = () => repository.choices();
  async function prepareBackup(): Promise<PreparedExport> {
    await flushSettings();
    const warnings: MessageText[] = [];
    const data = await withDataLock(() =>
      repository.exportData((message) => warnings.push(message)),
    );
    return { data, warnings };
  }
  async function exportBackup(selection: BackupSelection, prepared: PreparedExport) {
    const { selectExport, serializeExport } = await services.getBackup();
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
        report = await repository.importData(data, id, expected, selection);
      }, true))
    )
      throw new LocalizedError(notice.value || message('backup.import.errors.start_failed'));
    mailRevision.value++;
    return report!;
  }
  async function resetData() {
    if (!(await run(() => repository.reset(), true)))
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
      const backup = await services.getBackup();
      if (isDisposed || !settingsOpen.value) return;
      DataManagementDialog.value = backup.Dialog;
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
