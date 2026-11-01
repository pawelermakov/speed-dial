import { createTranslationContext } from '../../common/i18n';
export * from '../../common/i18n/contracts';
export * from '../../common/i18n/messages';
export * from '../../common/i18n/errors';
// A test-worker fixture, never imported by production modules.
export const testTranslations = createTranslationContext({ language: 'ru', mirror: false });
export const { t, language, setLanguage, formatMessage, languages } = testTranslations;
