import type { InjectionKey } from 'vue';
import type { TranslationContext } from './createI18n';
export const translationsKey: InjectionKey<TranslationContext> = Symbol('translations');
