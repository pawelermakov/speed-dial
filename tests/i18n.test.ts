import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  defaultLanguage,
  isLanguage,
  language,
  languages,
  setLanguage,
  t,
  message,
  formatMessage,
  joinMessages,
  LocalizedError,
  errorMessage,
} from '../services/i18n';
import ru from '../locales/ru.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import { defaults } from '../types/models';
import { validateSettings } from '../services/validation';
import { validSetting, syncPatch } from '../services/settingsSchema';
afterEach(() => setLanguage('ru'));
describe('i18n', () => {
  it('defaults to Russian and provides native language names', () => {
    expect(defaultLanguage).toBe('ru');
    expect(defaults.language).toBe('ru');
    expect(languages.map((row) => row.label)).toEqual(['Русский', 'English', 'Español']);
    expect(isLanguage('auto')).toBe(false);
  });
  it('uses three flat locale files with identical semantic keys and interpolation fields', () => {
    expect(readdirSync('locales').sort()).toEqual(['en.json', 'es.json', 'ru.json']);
    const keys = Object.keys(ru).sort(),
      fields = (text: string) => [...text.matchAll(/\{\w+\}/g)].map((row) => row[0]).sort();
    for (const catalog of [ru, en, es]) {
      expect(Object.keys(catalog).sort()).toEqual(keys);
      for (const [key, text] of Object.entries(catalog)) {
        expect(key).toMatch(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/);
        expect(typeof text).toBe('string');
        expect(text.trim(), key).not.toBe('');
        expect(fields(text), key).toEqual(fields(ru[key as keyof typeof ru]));
      }
    }
    for (const catalog of [en, es])
      for (const [key, text] of Object.entries(catalog))
        if (key !== 'language.names.ru') expect(text).not.toMatch(/[А-Яа-яЁё]/);
    expect(ru['search.yandex.placeholder']).toBe('Поиск в Яндексе…');
    expect(en['settings.title']).toBe('Settings');
    expect(es['settings.title']).toBe('Ajustes');
  });
  it('updates stored messages and nested service errors without translating user titles', () => {
    const notice = message('background.errors.display_failed', {
      error: message('images.errors.read_failed'),
    });
    const title = 'Настройки <img src=x onerror=alert(1)>';
    const confirmation = message('bookmarks.delete.description', { bookmark_name: title });
    setLanguage('es');
    expect(t('settings.title')).toBe('Ajustes');
    expect(formatMessage(notice)).toBe('No se pudo mostrar el fondo. No se pudo leer la imagen.');
    expect(formatMessage(confirmation)).toContain('«' + title + '»');
    expect(formatMessage('User content')).toBe('User content');
    setLanguage('en');
    expect(formatMessage(notice)).toBe(
      'Could not display the background. Could not read the image.',
    );
    expect(language.value).toBe('en');
  });
  it('translates background messages from another context without changing parameters', () => {
    setLanguage('es');
    expect(
      formatMessage(
        JSON.parse(
          JSON.stringify(
            message('sync.errors.saved_locally_retry', {
              error: message('sync.errors.storage_unavailable'),
            }),
          ),
        ),
      ),
    ).toBe(
      'El almacenamiento de sincronización no está disponible. Ajustes guardados localmente. Vuelve a comprobarlo.',
    );
    expect(formatMessage(message('backup.export.result.bookmarks', { count: 12 }))).toBe(
      'Marcadores exportados: 12.',
    );
  });
  it('saves language in current settings, backups and the Sync allowlist', () => {
    const settings = validateSettings({ ...defaults, language: 'es' });
    expect(validateSettings(JSON.parse(JSON.stringify(settings))).language).toBe('es');
    expect(syncPatch({ 'settings.v1.language': 'en' })).toEqual({ language: 'en' });
    for (const value of ['de', 'auto', null, 7]) {
      expect(() => validateSettings({ ...defaults, language: value })).toThrow();
      expect(validSetting('language', value)).toBe(false);
    }
  });
  it('contains every authored translation key used by components and services', () => {
    const files = [
      'App.vue',
      ...['components', 'services', 'utils', 'composables'].flatMap((dir) =>
        readdirSync(dir)
          .filter((name) => /\.(ts|vue)$/.test(name))
          .map((name) => dir + '/' + name),
      ),
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\b(?:t|message)\('([^']+)'/g))
        expect(Object.hasOwn(ru, match[1]!), file + ': ' + match[1]).toBe(true);
    }
  });
  it('provides localized manifest descriptions for all supported browser languages', () => {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
    expect(manifest.default_locale).toBe('ru');
    expect(manifest.description).toBe('__MSG_extensionDescription__');
    for (const code of ['ru', 'en', 'es']) {
      const messages = JSON.parse(readFileSync('locales/' + code + '.json', 'utf8'));
      expect(messages['extension.description'].length).toBeGreaterThan(30);
      expect(messages['extension.description']).toContain('Chrome');
      expect(messages['extension.description']).toContain('Firefox');
    }
  });
  it('renders structured lists, nested errors and user parameters after serialization and language changes', () => {
    const userName = 'Настройки';
    const error = new LocalizedError(message('images.errors.read_failed'));
    const stored = JSON.parse(
      JSON.stringify(
        joinMessages([
          message('background.errors.display_failed', { error: errorMessage(error) }),
          message('bookmarks.delete.description', { bookmark_name: userName }),
        ]),
      ),
    );
    expect(errorMessage(new Error('native failure'))).toBe('native failure');
    expect(errorMessage('raw failure')).toBe('raw failure');
    for (const code of ['ru', 'en', 'es'] as const) {
      setLanguage(code);
      const text = formatMessage(stored);
      expect(text).toContain(userName);
      expect(text).toContain(t('images.errors.read_failed'));
      expect(text).not.toContain('[object Object]');
      expect(text).not.toMatch(/\{\w+\}/);
    }
    setLanguage('en');
    expect(formatMessage('Настройки')).toBe('Настройки');
  });
  it('uses language-specific plural forms for zero, teens and compound numbers', () => {
    setLanguage('ru');
    for (const [count, noun] of [
      [0, 'закладок'],
      [1, 'закладка'],
      [2, 'закладки'],
      [5, 'закладок'],
      [11, 'закладок'],
      [21, 'закладка'],
      [22, 'закладки'],
      [25, 'закладок'],
      [111, 'закладок'],
    ] as const)
      expect(t('backup.import.result.bookmarks', { count })).toContain(count + ' ' + noun);
    for (const code of ['en', 'es'] as const) {
      setLanguage(code);
      expect(t('mail.accessibility.unread_count', { count: 1 })).toBe(
        code === 'en' ? ', 1 unread message' : ', 1 mensaje sin leer',
      );
      expect(t('mail.accessibility.unread_count', { count: 2 })).toBe(
        code === 'en' ? ', 2 unread messages' : ', 2 mensajes sin leer',
      );
    }
  });
});
