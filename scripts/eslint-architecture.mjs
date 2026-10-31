import { dirname, resolve } from 'node:path';
// Paths removed during stage 8. Resolve against the importer so legitimate
// feature-local services with the same basename remain available.
const retired = [
  'types/models',
  'services/i18n',
  'services/repository',
  'composables/useDial',
  'services/autoNames',
  'services/bookmarkAssets',
  'services/bookmarks',
  'services/capture',
  'services/database',
  'services/folderLocator',
  'services/importExport',
  'services/kinopoiskNetwork',
  'services/kinopoiskQuery',
  'services/mail',
  'services/network',
  'services/searchProviders',
  'services/settings',
  'services/settingsSchema',
  'services/settingsSync',
  'services/sync',
  'services/syncBackground',
  'services/syncClient',
  'services/thumbnails',
  'utils/backgroundPreview',
  'utils/backgroundResource',
  'utils/reorder',
  'utils/weather',
  'composables/useBookmarkSearch',
  'composables/useProviderSuggestions',
  'composables/useTheme',
];
const root = resolve(import.meta.dirname, '..');
const paths = new Set(retired.map((path) => resolve(root, path).toLowerCase()));
export default {
  rules: {
    'no-retired-imports': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          retired:
            'Import from the owning feature or shared infrastructure; {{path}} was removed during stage 8.',
        },
      },
      create(context) {
        function check(node, source) {
          if (typeof source !== 'string' || !source.startsWith('.')) return;
          const target = resolve(dirname(context.filename), source)
            .replace(/\.(?:ts|js)$/, '')
            .toLowerCase();
          if (paths.has(target))
            context.report({ node, messageId: 'retired', data: { path: source } });
        }
        return {
          'ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration': (node) =>
            check(node, node.source?.value),
          ImportExpression: (node) => check(node, node.source?.value),
          TSImportType: (node) =>
            check(node, node.argument?.literal?.value ?? node.argument?.value),
        };
      },
    },
  },
};
