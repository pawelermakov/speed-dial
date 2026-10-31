<script setup lang="ts">
import { formatMessage, joinMessages } from '../../../services/i18n';
import { useScreen } from '../screenContext';
import SettingsPanel from '../../../components/SettingsPanel.vue';
import FolderDialog from '../../../components/FolderDialog.vue';
import BookmarkDialog from '../../../components/BookmarkDialog.vue';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import ContextMenu from '../../../components/ContextMenu.vue';
const {
  dial,
  settings,
  bookmarks,
  folders,
  confirmation: confirm,
  backup,
  focus,
  contextActions,
  presentation,
  disabled,
  context,
} = useScreen();
const { snapshot, settingErrors, updateSettings, changeRoot, changeBackground, notice } = dial;
const { settingsOpen, settingsPanel, closeSettings } = settings;
const { bookmarkDialog, editing, dialogFolders, folderError, dialogError, saveBookmark } =
  bookmarks;
const { creatingFolder, editingFolder, folderDialogError, cancelFolder, saveFolder } = folders;
const { confirmation, confirmationBusy, confirmationError, closeConfirmation, confirmAction } =
  confirm;
const {
  DataManagementDialog,
  dataOpen,
  dataDialog,
  dataChoices,
  prepareBackup,
  exportBackup,
  importBackup,
  resetData,
  openDataManagement,
  afterSettingsLeave,
} = backup;
const {
  beforeDialogLeave,
  beforeDialogEnter,
  restoreDialogFocus,
  restoreConfirmationFocus,
  closeContext,
} = focus;
const { action, canMove } = contextActions;
const { motionEnabled } = presentation;
</script>
<template>
  <Transition
    name="settings-panel"
    :duration="motionEnabled ? 250 : 0"
    @before-leave="beforeDialogLeave"
    @after-leave="afterSettingsLeave"
    @before-enter="beforeDialogEnter"
  >
    <SettingsPanel
      v-if="settingsOpen"
      ref="settingsPanel"
      :settings="snapshot.settings"
      :root-id="snapshot.rootId"
      :operation-error="formatMessage(joinMessages(Object.values(settingErrors)))"
      :busy="disabled"
      :has-background="!!snapshot.background"
      :update-settings="updateSettings"
      :change-root="changeRoot"
      :change-background="changeBackground"
      @close="closeSettings"
      @manage="openDataManagement"
      @error="notice = $event"
    />
  </Transition>
  <Transition
    name="modal-panel"
    :duration="motionEnabled ? 250 : 0"
    @before-enter="beforeDialogEnter"
    @before-leave="beforeDialogLeave"
    @after-leave="restoreDialogFocus"
  >
    <FolderDialog
      v-if="creatingFolder || editingFolder"
      :title="editingFolder?.title"
      :busy="disabled"
      :error="folderDialogError"
      @close="cancelFolder"
      @save="saveFolder"
    />
  </Transition>
  <Transition
    name="modal-panel"
    :duration="motionEnabled ? 250 : 0"
    @before-enter="beforeDialogEnter"
    @before-leave="beforeDialogLeave"
    @after-leave="restoreDialogFocus"
  >
    <BookmarkDialog
      v-if="bookmarkDialog"
      :bookmark="editing"
      :folders="dialogFolders"
      :active-id="snapshot.activeId"
      :folder-error="folderError"
      :busy="disabled"
      :error="dialogError"
      @close="bookmarkDialog = false"
      @save="saveBookmark"
    />
  </Transition>
  <Transition
    name="modal-panel"
    :duration="motionEnabled ? 250 : 0"
    @before-enter="beforeDialogEnter"
    @before-leave="beforeDialogLeave"
    @after-leave="restoreDialogFocus"
  >
    <DataManagementDialog
      v-if="dataOpen"
      ref="dataDialog"
      :root-id="snapshot.rootId"
      :settings="snapshot.settings"
      :choices="dataChoices"
      :prepare-export="prepareBackup"
      :export-data="exportBackup"
      :import-data="importBackup"
      :reset-data="resetData"
      @close="dataOpen = false"
    />
  </Transition>
  <Transition
    name="modal-panel"
    :duration="motionEnabled ? 250 : 0"
    @before-enter="beforeDialogEnter"
    @before-leave="beforeDialogLeave"
    @after-leave="restoreConfirmationFocus"
  >
    <ConfirmDialog
      v-if="confirmation"
      :title="confirmation.title"
      :message="confirmation.message"
      :action-label="confirmation.actionLabel"
      :destructive="confirmation.destructive"
      :busy="confirmationBusy"
      :error="confirmationError"
      @close="closeConfirmation"
      @confirm="confirmAction"
    />
  </Transition>
  <Transition
    name="floating"
    :duration="motionEnabled ? 150 : 0"
    @before-enter="
      (element) => {
        (element as HTMLElement).inert = false;
        element.removeAttribute('aria-hidden');
      }
    "
    @before-leave="
      (element) => {
        beforeDialogLeave(element);
        element.setAttribute('aria-hidden', 'true');
      }
    "
  >
    <ContextMenu
      v-if="context"
      :x="context.x"
      :y="context.y"
      :bookmark="context.bookmark"
      :folder="context.folder"
      :can-move-left="canMove(-1)"
      :can-move-right="canMove(1)"
      @close="closeContext"
      @action="action"
    />
  </Transition>
</template>
