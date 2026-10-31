import { ref } from 'vue';
import type { DialState } from '../screenTypes';

export function useSettingsPanel({ flushSettings }: Pick<DialState, 'flushSettings'>) {
  const settingsOpen = ref(false);
  const settingsPanel = ref<{ flush(): Promise<void> }>();
  let settingsGeneration = 0;
  async function closeSettings() {
    if (!settingsOpen.value) return;
    const generation = settingsGeneration;
    await settingsPanel.value?.flush();
    await flushSettings();
    if (generation === settingsGeneration) settingsOpen.value = false;
  }
  function openSettings() {
    settingsGeneration++;
    settingsOpen.value = true;
  }

  return { settingsOpen, settingsPanel, closeSettings, openSettings };
}
