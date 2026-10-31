<script setup lang="ts">
import { useUiI18n } from '../shared/i18n';
import { type MessageText } from '../shared/i18n/contracts';
import { ref } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { ui } from '../utils/ui';
const { t: $t, formatMessage } = useUiI18n();

const props = defineProps<{ title?: string; busy: boolean; error: MessageText }>();
const emit = defineEmits<{ close: []; save: [title: string] }>();
const name = ref(props.title ?? '');
function submit() {
  if (!props.busy && name.value.trim()) emit('save', name.value.trim());
}
</script>
<template>
  <ModalDialog
    :title="title === undefined ? $t('folders.add.title') : $t('folders.edit.title')"
    :busy="busy"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-4 text-base" @submit.prevent="submit">
      <div>
        <label for="folder-name" class="block mb-1">{{ $t('folders.fields.name') }}</label>
        <input
          id="folder-name"
          v-model="name"
          :class="ui.input"
          class="h-10"
          autofocus
          maxlength="4096"
          :disabled="busy"
          :aria-describedby="error ? 'folder-save-error' : undefined"
        />
      </div>
      <p v-if="error" id="folder-save-error" role="alert">{{ formatMessage(error) }}</p>
      <button type="submit" :class="ui.button" class="h-10" :disabled="busy || !name.trim()">
        <span class="ui-action-label">{{
          title === undefined ? $t('common.create') : $t('common.save')
        }}</span>
      </button>
    </form>
  </ModalDialog>
</template>
