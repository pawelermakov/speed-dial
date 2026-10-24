import { spawnSync } from 'node:child_process';

const [group, ...args] = process.argv.slice(2);
const suites = {
  unit: ['node_modules/vue-tsc/bin/vue-tsc.js', 'node_modules/vitest/vitest.mjs'],
  browser: ['scroll-stability', 'smoke', 'search-providers', 'settings-sync', 'settings-autosave', 'bookmark-dialogs', 'folder-interaction', 'bookmark-drag', 'text-tiles', 'wallpaper-startup'],
  ui: ['scroll-stability', 'appearance', 'design-system-states', 'design-system-consistency', 'focus-styles', 'search-styles', 'toolbar-styles', 'bookmark-styles', 'startup-motion', 'glass-motion', 'folder-scroll-layout', 'apple-guidelines-audit'],
};
if (!Object.hasOwn(suites, group)) throw new Error('Expected suite: unit, browser or ui');
const list = args.includes('--list');
const forwarded = args.filter(arg => arg !== '--list');
if (group !== 'unit' && forwarded.some(arg => arg !== '--chrome-only'))
  throw new Error('Browser suites accept --chrome-only and --list');
const commands = group === 'unit'
  ? [[suites.unit[0], '--noEmit'], [suites.unit[1], 'run', ...forwarded]]
  : [
      ['node_modules/wxt/bin/wxt.mjs', 'build'],
      ['node_modules/wxt/bin/wxt.mjs', 'build', '-b', 'firefox'],
      ...suites[group].map(name => [`scripts/${name}.mjs`, ...forwarded]),
    ];
for (const command of commands) {
  console.log(`\n> node ${command.join(' ')}`);
  if (list) continue;
  const result = spawnSync(process.execPath, command, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
