import { expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useSettingsPanel } from '../../composables/useSettingsPanel';
import { useConfirmation } from '../../composables/useConfirmation';
import type { MessageText } from '../../common/i18n/contracts';

it('flushes the panel before settings and preserves a reopened panel', async () => {
  let finish!: () => void;
  const flushSettings = vi.fn(async () => {});
  const state = useSettingsPanel({ flushSettings });
  state.settingsPanel.value = {
    flush: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  };
  state.openSettings();
  const closing = state.closeSettings();
  expect(flushSettings).not.toHaveBeenCalled();
  state.openSettings();
  finish();
  await closing;
  expect(flushSettings).toHaveBeenCalledTimes(1);
  expect(state.settingsOpen.value).toBe(true);
  state.settingsPanel.value = undefined;
  await state.closeSettings();
  expect(state.settingsOpen.value).toBe(false);
});

it('prevents duplicate confirmation work and keeps failures open for retry', async () => {
  const notice = ref<MessageText>('failure');
  const state = useConfirmation({ notice, disabled: ref(false) });
  let finish!: (value: boolean) => void;
  const perform = vi
    .fn<() => Promise<boolean>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(true);
  state.askConfirmation('Delete', 'Selected bookmark', perform);
  const action = state.confirmAction();
  await state.confirmAction();
  state.closeConfirmation();
  expect(perform).toHaveBeenCalledTimes(1);
  expect(state.confirmation.value).toBeDefined();
  finish(false);
  await action;
  expect(state.confirmationError.value).toBe('failure');
  expect(state.confirmationBusy.value).toBe(false);
  await state.confirmAction();
  expect(perform).toHaveBeenCalledTimes(2);
  expect(state.confirmation.value).toBeUndefined();
});
