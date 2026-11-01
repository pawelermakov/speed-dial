import { dirname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const normalize = (path) => path.replaceAll('\\', '/');
const feature = (path) => /^app\/modules\/([^/]+)(?:\/|$)/.exec(path)?.[1];
const test = (path) =>
  /(?:^|\/)(?:tests|fixtures|__mocks__)(?:\/|$)|\.(?:test|spec)(?:\.|$)/.test(path);
const publicEntries = new Set([
  'bookmarks/folders',
  'backup/newtab',
  'bookmarks/locators',
  'settings/schema',
  'weather/components',
  ...['bookmarks', 'settings'].map((owner) => owner + '/background'),
  ...['bookmarks', 'settings', 'search', 'mail', 'backup'].map((owner) => owner + '/components'),
  ...['bookmarks', 'settings', 'appearance'].map((owner) => owner + '/composables'),
  ...['settings', 'search', 'mail'].map((owner) => owner + '/context'),
]);

export function boundaryViolation(importer, source, typeOnly = false) {
  const from = normalize(relative(root, importer));
  // ESLint configuration wires this test-owned rule plugin outside production.
  if (test(from) || from === 'eslint.config.mjs') return;
  const pure = /^app\/(?:.*\/)?(?:entities|helpers|services)\//.test(from);
  if (!typeOnly && (pure || /\/composables\//.test(from)) && /^(?:wxt|dexie)(?:\/|$)/.test(source))
    return 'Receive browser and database dependencies through ports.';
  if (!typeOnly && pure && /^(?:vue|vue-i18n)(?:\/|$)/.test(source))
    return 'Entities, helpers and services cannot depend on Vue runtime.';
  const target = source.startsWith('.')
    ? resolve(dirname(importer), source)
    : /^(?:@|~)\//.test(source)
      ? resolve(root, source.slice(2))
      : null;
  if (!target) return;
  const to = normalize(relative(root, target)).replace(/\.(?:ts|js|mjs)$/, '');
  if (test(to)) return 'Production code cannot import tests, fixtures or mocks.';
  if (
    from.startsWith('app/common/') &&
    (((to === 'app' || to.startsWith('app/')) && !to.startsWith('app/common/')) ||
      /^entrypoints(?:\/|$)/.test(to))
  )
    return 'Common code cannot depend on application or feature code.';
  const owner = feature(from),
    dependency = feature(to);
  if (owner && to.startsWith('app/') && !dependency && !to.startsWith('app/common/'))
    return 'A feature cannot depend on its parent application.';
  if (
    (!owner && /^(?:app|entrypoints)\//.test(from) && dependency) ||
    (owner && dependency && owner !== dependency)
  ) {
    const entry = to.split('/').slice(3);
    if (entry.at(-1) === 'index') entry.pop();
    if (
      entry.length > 1 ||
      (entry.length === 1 &&
        entry[0] !== 'index' &&
        !publicEntries.has(`${dependency}/${entry[0]}`))
    )
      return 'Import features through their public contracts.';
  }
  if (
    owner &&
    owner === dependency &&
    [
      `app/modules/${owner}`,
      `app/modules/${owner}/index`,
      ...['components', 'composables'].flatMap((layer) => [
        `app/modules/${owner}/${layer}`,
        `app/modules/${owner}/${layer}/index`,
      ]),
    ].includes(to)
  )
    return 'Use direct imports inside a feature instead of its own barrel.';
  if (
    !typeOnly &&
    (pure || /\/composables\//.test(from)) &&
    /\/(?:adapters|infrastructure|components)(?:\/|$)/.test(to)
  )
    return 'Composables receive dependencies; they cannot import concrete adapters or components.';
  if (
    !typeOnly &&
    /\/composables\//.test(from) &&
    /^app\/modules\/[^/]+\/(?:newtab|background)$/.test(to)
  )
    return 'UI composables receive services instead of loading module adapters.';
  if (
    !typeOnly &&
    pure &&
    (/^app\/common\/ui\//.test(to) ||
      /^app\/modules\/[^/]+\/(?:components|context|composables|newtab|background)(?:\/index)?$/.test(
        to,
      ))
  )
    return 'UI dependencies belong to components and UI composables.';
  if (!typeOnly && pure && /app\/common\/i18n(?:\/(?:index|createI18n|injection))?$/.test(to))
    return 'Use pure translation contracts; the UI context belongs to newtab.';
}

export const importBoundaries = {
  meta: { type: 'problem', schema: [], messages: { boundary: '{{reason}}' } },
  create(context) {
    function check(node, source) {
      if (typeof source !== 'string') return;
      const typeOnly =
        node.type === 'TSImportType' ||
        node.importKind === 'type' ||
        node.exportKind === 'type' ||
        (node.specifiers?.length > 0 &&
          node.specifiers.every((s) => s.importKind === 'type' || s.exportKind === 'type'));
      const reason = boundaryViolation(context.filename, source, typeOnly);
      if (reason) context.report({ node, messageId: 'boundary', data: { reason } });
    }
    function literal(node) {
      return (
        node?.value ??
        (node?.type === 'TemplateLiteral' && !node.expressions.length
          ? node.quasis[0]?.value.cooked
          : undefined)
      );
    }
    return {
      'ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration': (node) =>
        check(node, node.source?.value),
      ImportExpression: (node) => check(node, literal(node.source)),
      TSImportType: (node) => check(node, node.argument?.literal?.value ?? node.argument?.value),
    };
  },
};
