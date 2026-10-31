import { inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { translationsKey } from './injection';
export { createTranslationContext, type TranslationContext } from './createI18n';
export type { Translator } from './formatMessage';
export function useUiI18n() {
  useI18n({ useScope: 'global' });
  const context = inject(translationsKey);
  if (!context) throw new Error('Application translations were not installed');
  return context;
}
