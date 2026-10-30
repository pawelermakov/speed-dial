import { beforeEach, vi } from 'vitest';
import { setLanguage } from '../services/i18n';
vi.stubGlobal('navigator', { language: 'ru-RU', languages: ['ru-RU'] });
beforeEach(() => setLanguage('ru'));
