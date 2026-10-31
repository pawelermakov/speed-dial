import { message, errorMessage, type MessageText } from '../../../services/i18n';
import { ref, shallowRef } from 'vue';
import type { DialState } from '../screenTypes';
import type { Ref } from 'vue';

export function useConfirmation({
  disabled,
  notice,
}: {
  disabled: Readonly<Ref<boolean>>;
  notice: DialState['notice'];
}) {
  const confirmation = shallowRef<{
    title: MessageText;
    message: MessageText;
    perform: () => Promise<boolean>;
    actionLabel: MessageText;
    destructive: boolean;
  }>();
  const confirmationBusy = ref(false),
    confirmationError = ref<MessageText>('');
  function askConfirmation(
    title: MessageText,
    description: MessageText,
    perform: () => Promise<boolean>,
    actionLabel: MessageText = message('common.delete'),
    destructive = true,
  ) {
    if (confirmation.value || disabled.value) return;
    confirmationError.value = '';
    confirmation.value = { title, message: description, perform, actionLabel, destructive };
  }
  function closeConfirmation() {
    if (!confirmationBusy.value) confirmation.value = undefined;
  }
  async function confirmAction() {
    const current = confirmation.value;
    if (!current || confirmationBusy.value) return;
    confirmationBusy.value = true;
    confirmationError.value = '';
    try {
      if (await current.perform()) confirmation.value = undefined;
      else confirmationError.value = notice.value || message('errors.action_failed');
    } catch (error) {
      confirmationError.value = errorMessage(error);
    } finally {
      confirmationBusy.value = false;
    }
  }

  return {
    confirmation,
    confirmationBusy,
    confirmationError,
    askConfirmation,
    closeConfirmation,
    confirmAction,
  };
}
