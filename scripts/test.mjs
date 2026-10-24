import { spawnSync } from 'node:child_process';

const [group, ...args] = process.argv.slice(2);
const suites = {
  unit: ['node_modules/vue-tsc/bin/vue-tsc.js', 'node_modules/vitest/vitest.mjs'],
  browser: ['scroll-stability', 'data-management', 'themes', 'theme-startup', 'confirmation-dialogs', 'vertical-center', 'movie-search', 'empty-states', 'unified-search', 'keyboard-navigation', 'browser-parity', 'smoke', 'search-providers', 'settings-sync', 'settings-autosave', 'bookmark-dialogs', 'folder-interaction', 'bookmark-drag', 'text-tiles', 'wallpaper-startup'],
  ui: ['scroll-stability', 'data-management', 'themes', 'theme-startup', 'confirmation-dialogs', 'vertical-center', 'movie-search', 'empty-states', 'unified-search', 'keyboard-navigation', 'browser-parity', 'appearance', 'design-system-states', 'design-system-consistency', 'focus-styles', 'search-styles', 'toolbar-styles', 'bookmark-styles', 'startup-motion', 'glass-motion', 'folder-scroll-layout', 'apple-guidelines-audit'],
};
if (!Object.hasOwn(suites, group)) throw new Error('Expected suite: unit, browser or ui');
const list = args.includes('--list');
const forwarded = args.filter(arg => arg !== '--list');
if (group !== 'unit' && forwarded.some(arg => !['--chrome-only', '--firefox-only'].includes(arg)))
  throw new Error('Browser suites accept --chrome-only, --firefox-only and --list');
if (forwarded.includes('--chrome-only') && forwarded.includes('--firefox-only'))
  throw new Error('Choose only one browser filter');
const firefoxScenarios = new Set(['scroll-stability', 'data-management', 'themes', 'confirmation-dialogs', 'vertical-center', 'movie-search', 'empty-states', 'unified-search', 'keyboard-navigation', 'browser-parity', 'smoke', 'search-providers', 'settings-sync', 'settings-autosave', 'bookmark-dialogs', 'folder-interaction', 'text-tiles', 'wallpaper-startup', 'appearance']);
const selected = suites[group].filter(name => !forwarded.includes('--firefox-only') || firefoxScenarios.has(name));
const commands = group === 'unit'
  ? [[suites.unit[0], '--noEmit'], [suites.unit[1], 'run', ...forwarded]]
  : [
      ['node_modules/wxt/bin/wxt.mjs', 'build'],
      ['node_modules/wxt/bin/wxt.mjs', 'build', '-b', 'firefox'],
      ...selected.map(name => [`scripts/${name}.mjs`, ...forwarded]),
    ];
for (const command of commands) {
  console.log(`\n> node ${command.join(' ')}`);
  if (list) continue;
  const result = spawnSync(process.execPath, command, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
