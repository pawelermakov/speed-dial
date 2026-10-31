import { dirname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const normalize = (path) => path.replaceAll('\\', '/');
const feature = (path) => /^modules\/dial\/modules\/([^/]+)(?:\/|$)/.exec(path)?.[1];
const test = (path) =>
  /(?:^|\/)(?:tests|fixtures|__mocks__)(?:\/|$)|\.(?:test|spec)(?:\.|$)/.test(path);
const publicEntries = new Set(['bookmarks/folders', 'bookmarks/locators', 'settings/schema']);

export function boundaryViolation(importer, source, typeOnly = false) {
  const from = normalize(relative(root, importer));
  if (test(from)) return;
  const pure = /^modules\/.*\/(?:entities|helpers|services)\//.test(from);
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
  if (from.startsWith('shared/') && /^(?:modules|app|entrypoints)\//.test(to))
    return 'Shared code cannot depend on application or feature code.';
  const owner = feature(from),
    dependency = feature(to);
  if (owner && to.startsWith('modules/dial/') && !dependency)
    return 'A feature cannot depend on its parent dial application.';
  if (owner && dependency && owner !== dependency) {
    const entry = to.split('/').slice(4);
    if (
      entry.length > 1 ||
      (entry.length === 1 &&
        entry[0] !== 'index' &&
        !publicEntries.has(`${dependency}/${entry[0]}`))
    )
      return 'Import a sibling feature through its public contracts.';
  }
  if (
    owner &&
    owner === dependency &&
    [`modules/dial/modules/${owner}`, `modules/dial/modules/${owner}/index`].includes(to)
  )
    return 'Use direct imports inside a feature instead of its own barrel.';
  if (
    !typeOnly &&
    (pure || /\/composables\//.test(from)) &&
    /\/(?:adapters|infrastructure|components)\//.test(to)
  )
    return 'Composables receive dependencies; they cannot import concrete adapters or components.';
  if (!typeOnly && pure && /shared\/i18n(?:\/(?:index|createI18n|injection))?$/.test(to))
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
