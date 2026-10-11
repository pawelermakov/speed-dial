import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import manifest from './manifest.json';
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  imports: false,
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: ({ browser }) => ({
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    ...(browser === 'firefox' ? { browser_specific_settings: { gecko: {
      id: 'speed-dial-x@pawelermakov.github.io', strict_min_version: '140.0',
      data_collection_permissions: { required: ['searchTerms', 'personallyIdentifyingInfo', 'browsingActivity'] },
    } } } : {}),
    // Existing legacy permissions, explicitly retained by SPEC §3.1/3.9.
    // all_urls is required by captureVisibleTab for automatically created tabs.
    permissions: manifest.permissions,
    host_permissions: manifest.host_permissions,
    icons: manifest.icons,
  }),
});
