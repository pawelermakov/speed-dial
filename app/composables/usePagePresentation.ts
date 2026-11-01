import { message } from '../common/i18n/messages';
import { errorMessage } from '../common/i18n/errors';
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import type { BackgroundPresentationPort } from '../modules/appearance';
import type { DialState } from './screenTypes';

export function usePagePresentation(
  { snapshot, loading, notice }: Pick<DialState, 'snapshot' | 'loading' | 'notice'>,
  {
    createResource,
    cachePreview: cacheBackgroundPreview,
    clearPreview: clearBackgroundPreview,
  }: BackgroundPresentationPort,
) {
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion:reduce)');
  const reducedMotion = ref(reducedMotionQuery.matches);
  const motionEnabled = computed(() => !reducedMotion.value);
  function motionPreferenceChanged(event: MediaQueryListEvent) {
    reducedMotion.value = event.matches;
  }
  reducedMotionQuery.addEventListener('change', motionPreferenceChanged);
  onUnmounted(() => reducedMotionQuery.removeEventListener('change', motionPreferenceChanged));
  const keyboardFocus = ref(true);
  function trackKeyboardFocus(event: KeyboardEvent) {
    if (
      !event.isComposing &&
      [
        'Tab',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'F10',
        'ContextMenu',
      ].includes(event.key)
    )
      keyboardFocus.value = true;
  }
  function trackPointerFocus() {
    keyboardFocus.value = false;
  }
  window.addEventListener('keydown', trackKeyboardFocus, true);
  window.addEventListener('pointerdown', trackPointerFocus, true);
  onUnmounted(() => {
    window.removeEventListener('keydown', trackKeyboardFocus, true);
    window.removeEventListener('pointerdown', trackPointerFocus, true);
  });
  const backgroundUrl = ref('');
  let decodedBackground: { url: string; image: HTMLImageElement } | undefined;
  const backgroundResource = createResource(
    async (url) => {
      backgroundUrl.value = url;
      if (url && decodedBackground?.url === url) cacheBackgroundPreview(decodedBackground.image);
      else if (!url) clearBackgroundPreview();
      decodedBackground = undefined;
      await nextTick();
    },
    async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      decodedBackground = { url, image };
    },
  );
  watch([() => snapshot.value.background, loading], ([blob, isLoading]) => {
    if (!blob && isLoading) return;
    if (!blob) clearBackgroundPreview();
    void backgroundResource.replace(blob).catch((error) => {
      notice.value = message('background.errors.display_failed', { error: errorMessage(error) });
    });
  });
  onUnmounted(() => backgroundResource.dispose());

  return { motionEnabled, keyboardFocus, backgroundUrl };
}
