<script setup lang="ts">
import { useUiI18n } from '../i18n';
import { type MessageText } from '../i18n/contracts';
import { useId } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { ui } from '../ui/controls';
const { t: $t, formatMessage } = useUiI18n();

const props = defineProps<{
  title: MessageText;
  message: MessageText;
  actionLabel: MessageText;
  destructive: boolean;
  busy: boolean;
  error: MessageText;
}>();
const emit = defineEmits<{ close: []; confirm: [] }>();
const messageId = useId();
function escape(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  event.stopPropagation();
  if (!props.busy) emit('close');
}
</script>
<template>
  <ModalDialog
    class="confirmation-dialog"
    :title="formatMessage(title)"
    :busy="busy"
    :aria-describedby="messageId"
    @keydown.esc="escape"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-4 text-base [overflow-wrap:anywhere]">
      <p :id="messageId">{{ formatMessage(message) }}</p>
      <p v-if="error" role="alert">{{ formatMessage(error) }}</p>
      <p v-if="busy" role="status">{{ $t('common.working') }}</p>
      <div class="grid grid-cols-2 gap-3">
        <button
          type="button"
          :class="[ui.button, { secondary: !destructive }]"
          autofocus
          :disabled="busy"
          @click="emit('close')"
        >
          <span class="ui-action-label">{{ $t('common.cancel') }}</span>
        </button>
        <button
          type="button"
          :class="[ui.button, { danger: destructive }]"
          :disabled="busy"
          @click="emit('confirm')"
        >
          <span class="ui-action-label">{{ formatMessage(actionLabel) }}</span>
        </button>
      </div>
    </div>
  </ModalDialog>
</template>
