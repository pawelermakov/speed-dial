import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createTranslationContext } from '../../../common/i18n/createI18n';
import { message } from '../../../common/i18n/messages';
import { LocalizedError, errorMessage } from '../../../common/i18n/errors';
import type { MessageKey } from '../../../common/i18n/contracts';
import ru from '../../../../locales/ru.json';
import en from '../../../../locales/en.json';
import es from '../../../../locales/es.json';
import baseline from '../../fixtures/i18n-baseline.json';

afterEach(() => vi.unstubAllGlobals());
it('matches the message baseline for plural edge cases and literal parameters', () => {
  const catalogs = { ru, en, es };
  const keys = Object.keys(ru).sort() as MessageKey[];
  expect(keys).toHaveLength(baseline.keyCount);
  for (const code of ['ru', 'en', 'es'] as const) {
    const context = createTranslationContext({ language: code, mirror: false });
    try {
      const rows = keys.flatMap((key) =>
        baseline.counts.map((count) => {
          const params = Object.fromEntries(
            [...catalogs[code][key].matchAll(/\{(\w+)\}/g)].map(([, field]) => [
              field!,
              field === 'count' ? count : '[' + field + '@{}|]',
            ]),
          );
          return [key, count, context.t(key, { ...params, count })];
        }),
      );
      expect(createHash('sha256').update(JSON.stringify(rows)).digest('hex'), code).toBe(
        baseline.hashes[code],
      );
    } finally {
      context.dispose();
    }
  }
});
it('keeps application locales and message catalogs independent while rendering the same DTO', () => {
  const first = createTranslationContext({ language: 'ru', mirror: false });
  const second = createTranslationContext({ language: 'ru', mirror: false });
  try {
    const error = new LocalizedError(message('settings.title'));
    first.setLanguage('en');
    expect(first.formatMessage(errorMessage(error))).toBe('Settings');
    expect(second.formatMessage(errorMessage(error))).toBe('Настройки');
    expect(error.message).toBe('settings.title');
    first.plugin.global.setLocaleMessage('ru', { ...ru, 'settings.title': 'Changed' });
    first.setLanguage('ru');
    expect(first.t('settings.title')).toBe('Changed');
    expect(second.t('settings.title')).toBe('Настройки');
  } finally {
    first.dispose();
    second.dispose();
  }
});
it('uses the optional startup mirror and updates document language before mount', () => {
  const values = new Map([['speed-dial-language', 'es']]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
  const document = { documentElement: { lang: '' } };
  vi.stubGlobal('document', document);
  const context = createTranslationContext();
  try {
    expect(context.language.value).toBe('es');
    context.setLanguage('en');
    expect(document.documentElement.lang).toBe('en');
    expect(values.get('speed-dial-language')).toBe('en');
  } finally {
    context.dispose();
  }
});
