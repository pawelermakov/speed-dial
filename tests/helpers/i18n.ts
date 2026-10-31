import { createTranslationContext } from '../../shared/i18n';
export * from '../../shared/i18n/contracts';
export * from '../../shared/i18n/messages';
export * from '../../shared/i18n/errors';
// A test-worker fixture, never imported by production modules.
export const testTranslations = createTranslationContext({ language: 'ru', mirror: false });
export const { t, language, setLanguage, formatMessage, languages } = testTranslations;
