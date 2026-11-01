<script setup lang="ts">
import { useUiI18n } from '../../../common/i18n';
import { type MessageText } from '../../../common/i18n/contracts';
import SelectChevron from '../../../common/components/SelectChevron.vue';
import { ui } from '../../../common/ui/controls';
import { computed, ref } from 'vue';
import { normalizeBookmarkUrl } from '../helpers/url';
import type { Bookmark, Folder } from '../entities/models';
import SwitchControl from '../../../common/components/SwitchControl.vue';
import ModalDialog from '../../../common/components/ModalDialog.vue';
import InfoTooltip from '../../../common/components/InfoTooltip.vue';
const { t: $t, formatMessage } = useUiI18n();

const props = defineProps<{
  bookmark?: Bookmark;
  folders: Folder[];
  activeId?: string | null;
  busy: boolean;
  error: MessageText;
  folderError: MessageText;
}>();
const emit = defineEmits<{
  close: [];
  save: [
    value: {
      url: string;
      title: string;
      capture: boolean;
      parentId?: string;
      titleEdited: boolean;
    },
  ];
}>();
const url = ref(props.bookmark?.url ?? '');
const title = ref(props.bookmark?.title ?? '');
const titleEdited = ref(false);
const capture = ref(true);
const parentId = ref(
  props.bookmark?.parentId ??
    (props.folders.some((row) => row.id === props.activeId)
      ? props.activeId!
      : props.folders[0]?.id),
);
const validUrl = computed(() => {
  try {
    normalizeBookmarkUrl(url.value);
    return true;
  } catch {
    return false;
  }
});
function submit() {
  if (props.busy || !validUrl.value) return;
  emit('save', {
    url: url.value,
    title: title.value,
    capture: capture.value,
    parentId: parentId.value,
    titleEdited: titleEdited.value,
  });
}
</script>
<template>
  <ModalDialog
    id="bookmark-modal"
    :title="bookmark ? $t('bookmarks.edit.title') : $t('bookmarks.add.title')"
    bookmark
    :busy="busy"
    @close="emit('close')"
  >
    <form
      class="bookmark-form flex flex-col gap-4 min-w-0 text-base"
      novalidate
      @submit.prevent="submit"
    >
      <div>
        <label for="bookmark-url" class="block mb-1">{{ $t('bookmarks.fields.url') }}</label>
        <input
          id="bookmark-url"
          v-model="url"
          inputmode="url"
          autocomplete="url"
          autocapitalize="none"
          spellcheck="false"
          :class="ui.input"
          autofocus
          required
          :disabled="busy"
        />
      </div>
      <div>
        <label for="bookmark-title" class="block mb-1">{{ $t('bookmarks.fields.name') }}</label>
        <input
          id="bookmark-title"
          v-model="title"
          :class="ui.input"
          :disabled="busy"
          @input="titleEdited = true"
        />
      </div>
      <div>
        <label for="bookmark-folder" class="block mb-1">{{ $t('bookmarks.fields.folder') }}</label>
        <div class="ui-select">
          <select
            id="bookmark-folder"
            v-model="parentId"
            :disabled="busy"
            :class="ui.input"
            :aria-invalid="!!folderError"
            :aria-describedby="folderError ? 'bookmark-folder-error' : undefined"
          >
            <option v-for="folder in folders" :key="folder.id" :value="folder.id">
              {{ folder.title }}
            </option></select
          ><SelectChevron />
        </div>
        <p v-if="folderError" id="bookmark-folder-error" role="alert" class="mt-1">
          {{ formatMessage(folderError) }}
        </p>
      </div>
      <SwitchControl v-if="!bookmark" v-model="capture" :disabled="busy" class="capture-option">
        {{ $t('thumbnails.capture.label') }}
        <template #label-extra
          ><InfoTooltip
            id="bookmark-capture-info"
            :label="$t('thumbnails.capture.help_label')"
            target="#bookmark-modal"
            >{{ $t('thumbnails.capture.help') }}</InfoTooltip
          ></template
        >
      </SwitchControl>
      <p v-if="error" role="alert">{{ formatMessage(error) }}</p>
      <p v-if="busy" role="status">{{ $t('common.saving') }}</p>
      <button type="submit" class="button" :class="ui.button" :disabled="busy || !validUrl">
        <span class="ui-action-label">{{ bookmark ? $t('common.save') : $t('common.add') }}</span>
      </button>
    </form>
  </ModalDialog>
</template>
<style scoped>
[aria-invalid='true'] {
  border-color: var(--danger);
}
.bookmark-form :is(.ui-control, .ui-button) {
  height: 40px;
  box-sizing: border-box;
  line-height: 20px;
}
</style>
