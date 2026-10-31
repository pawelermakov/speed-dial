import { dirname, resolve } from 'node:path';
import { importBoundaries } from './import-boundaries.mjs';
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
    'import-boundaries': importBoundaries,
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
          if (typeof source !== 'string' || (!source.startsWith('.') && !/^(?:@|~)\//.test(source)))
            return;
          const target = (
            source.startsWith('.')
              ? resolve(dirname(context.filename), source)
              : resolve(root, source.slice(2))
          )
            .replace(/\.(?:ts|js)$/, '')
            .toLowerCase();
          if (paths.has(target))
            context.report({ node, messageId: 'retired', data: { path: source } });
        }
        return {
          'ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration': (node) =>
            check(node, node.source?.value),
          ImportExpression: (node) =>
            check(
              node,
              node.source?.value ??
                (node.source?.type === 'TemplateLiteral' && !node.source.expressions.length
                  ? node.source.quasis[0]?.value.cooked
                  : undefined),
            ),
          TSImportType: (node) =>
            check(node, node.argument?.literal?.value ?? node.argument?.value),
        };
      },
    },
  },
};
