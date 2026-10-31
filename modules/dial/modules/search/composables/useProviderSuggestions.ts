import { useUiI18n } from '../../../../../shared/i18n';
import { message } from '../../../../../shared/i18n/messages';
import { type MessageText } from '../../../../../shared/i18n/contracts';
import { ref, shallowRef, watch, onUnmounted, type Ref } from 'vue';
import type { SearchProviderId, SearchSuggestion } from '../entities/models';
import { useServices } from '../../../../../app/serviceContext';
import type { createSearchService } from '../services/suggestions';

export function useProviderSuggestions(
  query: Ref<string>,
  provider: Ref<SearchProviderId>,
  service: ReturnType<typeof createSearchService> = useServices().search,
  language = useUiI18n().language,
) {
  const { suggestions: providerSuggestions } = service;
  const items = shallowRef<SearchSuggestion[]>([]),
    error = ref<MessageText>(''),
    loaded = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined,
    request: AbortController | undefined,
    generation = 0;
  const stop = watch(
    [query, provider, language],
    () => {
      clearTimeout(timer);
      request?.abort();
      const current = ++generation;
      items.value = [];
      error.value = '';
      loaded.value = false;
      const text = query.value.trim(),
        source = provider.value;
      if (!text || source === 'bookmarks') return;
      timer = setTimeout(async () => {
        const controller = new AbortController();
        request = controller;
        try {
          const next = await providerSuggestions(source, text, controller.signal);
          if (current === generation) items.value = next;
        } catch {
          if (current === generation && !controller.signal.aborted)
            error.value = message('search.suggestions.unavailable');
        } finally {
          if (current === generation) loaded.value = true;
        }
      }, 250);
    },
    { flush: 'sync' },
  );
  onUnmounted(() => {
    generation++;
    stop();
    clearTimeout(timer);
    request?.abort();
  });
  return { items, error, loaded };
}
