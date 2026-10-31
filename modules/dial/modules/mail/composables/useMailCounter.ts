import { ref, watch, onUnmounted, type Ref } from 'vue';
import type { MailProvider, MailStatus } from '../entities/models';
import type { MailService } from '../services/counter';
export function useMailCounter(provider: Ref<MailProvider>, service: MailService) {
  const count = ref<number | null>(null),
    status = ref<MailStatus>('loading');
  let request: AbortController | undefined;
  const stop = watch(
    provider,
    async (id) => {
      request?.abort();
      count.value = null;
      status.value = 'loading';
      const controller = new AbortController();
      request = controller;
      try {
        const value = await service.unread(id, controller.signal);
        if (request === controller && !controller.signal.aborted) {
          count.value = value;
          status.value = 'ready';
        }
      } catch (cause) {
        if (request === controller && !controller.signal.aborted) {
          status.value = service.errorStatus(cause);
        }
      }
    },
    { immediate: true },
  );
  onUnmounted(() => {
    stop();
    request?.abort();
    request = undefined;
  });
  return { count, status };
}
