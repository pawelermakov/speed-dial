import { ref, onUnmounted } from 'vue';
import { message } from '../../../common/i18n/messages';
import type { MessageText } from '../../../common/i18n/contracts';
export interface BackgroundStateOptions {
  read(): Promise<Blob | null>;
  save(blob: Blob | null): Promise<void>;
  publish(blob: Blob | null): void;
  track<T>(promise: Promise<T>): Promise<T>;
  announce(): void;
  errorText(error: unknown): MessageText;
}
export function useBackgroundState(options: BackgroundStateOptions) {
  const error = ref<MessageText>();
  let version = 0,
    dirty = true,
    disposed = false;
  function loadInitial() {
    const sequence = version;
    void options
      .read()
      .then((blob) => {
        if (!disposed && dirty && sequence === version) options.publish(blob);
      })
      .catch(() => {});
  }
  function change(blob: Blob | null): Promise<boolean> {
    const sequence = ++version;
    return options.track(
      (async () => {
        try {
          await options.save(blob);
          if (sequence === version && !disposed) {
            options.publish(blob);
            error.value = undefined;
            options.announce();
          }
          return true;
        } catch (cause) {
          if (sequence === version && !disposed)
            error.value = message('settings.errors.save_background_failed', {
              error: options.errorText(cause),
            });
          return false;
        }
      })(),
    );
  }
  onUnmounted(() => {
    disposed = true;
  });
  return {
    error,
    change,
    loadInitial,
    get dirty() {
      return dirty;
    },
    invalidate() {
      dirty = true;
    },
    acceptRead(included: boolean) {
      if (included) dirty = false;
    },
    clearError() {
      error.value = undefined;
    },
  };
}
