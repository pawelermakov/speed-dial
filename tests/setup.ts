import { beforeEach, vi } from 'vitest';
import { setLanguage } from './helpers/i18n';
import './helpers/localizedMatcher';
vi.stubGlobal('navigator', { language: 'ru-RU', languages: ['ru-RU'] });
beforeEach(() => setLanguage('ru'));
