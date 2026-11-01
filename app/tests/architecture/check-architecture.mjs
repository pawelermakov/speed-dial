import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../../..');
const files = [];
function scan(dir) {
  for (const item of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory() && item.name !== 'tests') scan(path);
    else if (/\.(?:ts|vue)$/.test(path) && !/\.test\.ts$/.test(path)) files.push(path);
  }
}
for (const dir of ['app', 'entrypoints']) scan(dir);
const graph = new Map();
function target(file, source) {
  if (!source.startsWith('.') && !/^(?:@|~)\//.test(source)) return;
  const base = source.startsWith('.')
    ? resolve(root, dirname(file), source)
    : resolve(root, source.slice(2));
  const found = [base, `${base}.ts`, `${base}.vue`, `${base}/index.ts`].find(
    (p) => existsSync(p) && /\.(?:ts|vue)$/.test(p),
  );
  return found && relative(root, found).replaceAll('\\', '/');
}
for (const file of files) {
  const text = readFileSync(resolve(root, file), 'utf8');
  const code = file.endsWith('.vue')
    ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n')
    : text;
  const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const deps = [];
  for (const node of ast.statements) {
    if (
      !(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ||
      !node.moduleSpecifier ||
      !ts.isStringLiteral(node.moduleSpecifier)
    )
      continue;
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) continue;
      if (
        clause &&
        !clause.name &&
        clause.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.length &&
        clause.namedBindings.elements.every((s) => s.isTypeOnly)
      )
        continue;
    } else if (
      node.isTypeOnly ||
      (node.exportClause &&
        ts.isNamedExports(node.exportClause) &&
        node.exportClause.elements.length &&
        node.exportClause.elements.every((s) => s.isTypeOnly))
    )
      continue;
    const dependency = target(file, node.moduleSpecifier.text);
    if (dependency) deps.push(dependency);
  }
  graph.set(file, deps);
}
const visited = new Set(),
  active = [];
function visit(file) {
  const cycle = active.indexOf(file);
  if (cycle !== -1)
    throw new Error(`Runtime import cycle: ${[...active.slice(cycle), file].join(' → ')}`);
  if (visited.has(file)) return;
  active.push(file);
  for (const dependency of graph.get(file) ?? []) visit(dependency);
  active.pop();
  visited.add(file);
}
for (const file of files) visit(file);
console.log(`PASS architecture: ${files.length} production files, no static runtime import cycles`);
