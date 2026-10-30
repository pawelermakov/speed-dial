import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import manifest from './manifest.json';
import ru from './locales/ru.json';
import en from './locales/en.json';
import es from './locales/es.json';
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  imports: false,
  hooks: {
    'build:publicAssets': (_wxt, files) => {
      for (const [language, messages] of Object.entries({ ru, en, es }))
        files.push({
          relativeDest: '_locales/' + language + '/messages.json',
          contents: JSON.stringify({
            extensionDescription: { message: messages['extension.description'] },
          }),
        });
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: ({ browser }) => ({
    name: manifest.name,
    description: manifest.description,
    default_locale: manifest.default_locale,
    version: manifest.version,
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'speed-dial-x@pawelermakov.github.io',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['searchTerms', 'personallyIdentifyingInfo', 'browsingActivity'],
              },
            },
          },
        }
      : { key: manifest.key }),
    // Host permissions grant HTTP(S) tab metadata without the separate tabs permission.
    // Chrome-only APIs are excluded from Firefox.
    // all_urls is required by captureVisibleTab for automatically created tabs.
    permissions: [
      ...manifest.permissions,
      ...(browser === 'firefox' ? [] : ['favicon', 'identity', 'identity.email']),
    ],
    host_permissions: manifest.host_permissions,
    icons: manifest.icons,
  }),
});
