import assert from 'node:assert/strict';
export const i18nLocales = ['ru-RU', 'es-MX', 'de-DE', 'es-ES', 'fr-FR'];
export const requiredArtifacts = {
  themes: 42,
  smoke: 2,
  'settings-sync': 4,
  'settings-autosave': 4,
  'search-providers': 15,
  'folder-interaction': 5,
  'bookmark-dialogs': 7,
  appearance: 49,
  'data-management': 26,
  'startup-motion': 7,
  'design-system-states': 61,
  'bookmark-styles': 12,
  'toolbar-styles': 19,
  'search-styles': 14,
  'design-system-consistency': 4,
  'apple-guidelines-audit': 8,
  'text-tiles': 10,
  'wallpaper-startup': 3,
  'weather-widget': 15,
  'mail-indicators': 5,
  'scroll-stability': 2,
  'confirmation-dialogs': 6,
  'empty-states': 11,
};

export const requiredCases = {
  themes: ['shared-behavior'],
  'movie-search': ['shared-behavior'],
  'unified-search': ['shared-behavior'],
  'browser-parity': ['shared-behavior'],
  'keyboard-navigation': ['shared-behavior'],
  'vertical-center': ['shared-behavior'],

  smoke: [
    'native-clean-profile',
    'native-capture-custom-title',
    'source-autosave-and-peer-cache',
    'folder-and-storage-failures',
    'external-events-and-transfer',
    'native-drag-reload',
    'folder-crud-and-confirmations',
    'backup-import-and-safe-reset',
    'local-search-and-shortcut-isolation',
    'edit-and-external-folder-removal',
    'native-source-fallback',
  ],
  'settings-sync': [
    'native-identity-and-clean-profiles',
    'sparse-delivery-and-focused-edit',
    'live-peer',
    'native-failure-and-retry',
    'restart-and-local-confirmation',
    'portable-folder-delivery',
    'rename-delete-without-implicit-writes',
    'layout-360',
    'layout-1280',
    'memory-only-identity',
  ],
  'settings-autosave': [
    'native-close-flush',
    'numeric-autosave',
    'concurrent-tabs',
    'rollback-and-retry',
    'background-and-source-stability',
    'native-account-capability',
    'account-signed-out',
    'account-signed-in',
    'account-error',
    'layout-360',
    'layout-1280',
    'layout-1920',
    'reload-persistence',
    'pending-edit-import',
    'pending-edit-reset',
  ],
  'search-providers': [
    'flat-provider-options',
    ...['yandex', 'google', 'kinopoisk', 'imdb', 'myshows'].map((id) => `provider-${id}`),
    'stale-cancellation-and-errors',
    'unknown-provider-fallback',
    'layout-360',
    'layout-1280',
    'layout-1920',
  ],
  'folder-interaction': [
    'native-reorder',
    'partial-native-move',
    'drag-guards',
    'folder-crud',
    'delete-protection',
    'external-move-and-title',
    'layout-360',
    'layout-1280',
    'layout-1920',
    'search-and-appearance',
    'html5-sort-and-selection',
  ],
  'bookmark-dialogs': [
    'defaults-tooltips-layouts',
    'url-validation',
    'capture-titles-and-edits',
    'cancel-and-failures',
    'stale-folder-and-move',
    'double-submit-and-appearance',
    'native-browser-capture',
  ],
  appearance: [
    ...[320, 360, 1280, 1920].flatMap((width) =>
      ['none', 'light', 'dark', 'pattern'].map((background) => `layout-${width}-${background}`),
    ),
    'zoom-200',
    'accessibility-media',
  ],
  'data-management': ['backup-behavior', 'native-download', 'native-clean-profile-import'],
  'bookmark-drag': [
    'asset-refresh-and-grid-height',
    'native-gap-drop',
    'native-favicon-drag',
    'native-cancel',
    'external-edit-cancels',
    'trailing-slot-appends',
  ],
  'startup-motion': [
    'pending-peer',
    'decode-startup',
    'folder-reveal-metadata',
    'bitmap-360',
    'bitmap-1280',
    'bitmap-1920',
    'reduced-motion',
  ],
  'design-system-states': [
    ...[320, 360, 768, 1024, 1280, 1920].map((width) => `states-${width}`),
    'accessibility-media',
  ],
  'bookmark-styles': [
    ...[320, 360, 1280, 1920].flatMap((width) =>
      ['light', 'dark', 'pattern'].map((name) => `tiles-${width}-${name}`),
    ),
    'accessibility-media',
  ],
  'toolbar-styles': [
    ...[320, 360, 768, 1024, 1280, 1920].map((width) => `controls-${width}`),
    'pending-capture',
    'mail-counts',
    'mail-error-focus',
    'accessibility-media',
  ],
  'search-styles': [
    ...[320, 360, 700, 1280].map((width) => `controls-${width}`),
    ...[320, 1280].flatMap((width) =>
      ['light', 'dark', 'pattern'].map((name) => `background-${width}-${name}`),
    ),
    'short-320-180',
    'short-360-240',
    'short-1280-240',
    'empty-error-feedback',
    'accessibility-media',
  ],
  'design-system-consistency': [
    'surfaces-320',
    'surfaces-1280',
    'shared-signatures',
    'accessibility-media',
  ],
  'apple-guidelines-audit': [
    'modal-tooltips-320-240',
    'modal-tooltips-320-800',
    'modal-tooltips-1280-800',
    'search-bookmark-backup-focus',
    'contrast-transparency-motion',
    'coarse-pointer',
  ],
  'focus-styles': [
    'pointer-keyboard-focus',
    'local-search-focus',
    'switch-focus',
    'forced-colors-focus',
  ],
  'folder-scroll-layout': ['overflow-320', 'overflow-1280', 'overflow-1920'],
  'glass-motion': [
    'settings-enter',
    'settings-leave',
    'modal-enter',
    'modal-leave',
    'reduced-motion',
  ],
  'text-tiles': [
    'assets-and-startup-stability',
    'preview-rename-stability',
    'responsive-layouts',
    'ico-colours-and-reload',
  ],
  'wallpaper-startup': [
    'preview-before-app',
    'decode-handoff',
    'wallpaper-replacement-removal',
    'stale-preview-cleanup',
  ],
  i18n: i18nLocales.map((tag) => `locale-${tag}`),
  'weather-widget': ['offline-forecast-link', 'weather-behavior', 'weather-accessibility'],
  'mail-indicators': ['mail-behavior', 'mail-accessibility'],
  'scroll-stability': ['scroll-overflow-behavior', 'forced-colors-unmasked-tiles'],
  'confirmation-dialogs': ['confirmation-actions-and-artifacts'],
  'empty-states': ['empty-states-and-artifacts', 'empty-accessibility'],
  'theme-startup': [
    'native-second-tab',
    'before-app-dark-light',
    'before-app-light-dark',
    'before-app-system-dark',
    'before-app-system-light',
    'dark-keyboard-focus',
    'increased-contrast',
    'native-transparency-capability',
    'reduced-transparency',
    'forced-colors-keyboard-focus',
  ],
};
export const scenarioReportPath = (id, browser) =>
  `.browser-test/parity-reports/${id}-${browser}.json`;
export function validateScenarioReport(report, { id, browser, runId }) {
  const fields = new Set([
    'id',
    'browser',
    'runId',
    'status',
    'cases',
    'initialMedia',
    'nativeTransparency',
    'transparency',
    'artifactCount',
  ]);
  assert.ok(
    Object.keys(report).every((key) => fields.has(key)),
    'Coverage reports cannot contain paths or diagnostic text',
  );
  assert.match(report.runId, /^[0-9a-f-]{36}$/i);
  for (const field of ['initialMedia', 'nativeTransparency', 'transparency'])
    if (report[field]) {
      assert.ok(
        Object.keys(report[field]).every((key) =>
          ['transparencyFeatureEnabledForTest', 'transparencyAvailable'].includes(key),
        ),
      );
      assert.ok(Object.values(report[field]).every((value) => typeof value === 'boolean'));
    }
  assert.ok(Object.hasOwn(requiredCases, id), `Unknown report contract: ${id}`);
  assert.equal(report.id, id);
  assert.equal(report.browser, browser);
  assert.equal(report.runId, runId, 'Report must belong to this run');
  assert.equal(report.status, 'passed');
  if (Object.hasOwn(requiredArtifacts, id))
    assert.equal(
      report.artifactCount,
      requiredArtifacts[id],
      'All required screenshots must be produced',
    );
  else assert.equal(report.artifactCount, undefined);
  assert.deepEqual(
    report.cases,
    requiredCases[id],
    'Every required case must complete exactly once',
  );
}

const sharedScenarios = [
  'i18n',
  'mail-indicators',
  'weather-widget',
  'scroll-stability',
  'data-management',
  'themes',
  'theme-startup',
  'confirmation-dialogs',
  'vertical-center',
  'movie-search',
  'empty-states',
  'unified-search',
  'keyboard-navigation',
  'browser-parity',
];
const browserScenarios = [
  ...sharedScenarios,
  'smoke',
  'search-providers',
  'settings-sync',
  'settings-autosave',
  'bookmark-dialogs',
  'folder-interaction',
  'bookmark-drag',
  'text-tiles',
  'wallpaper-startup',
];
const uiScenarios = [
  ...sharedScenarios,
  'appearance',
  'design-system-states',
  'design-system-consistency',
  'focus-styles',
  'search-styles',
  'toolbar-styles',
  'bookmark-styles',
  'startup-motion',
  'glass-motion',
  'folder-scroll-layout',
  'apple-guidelines-audit',
];
export const suites = {
  unit: ['node_modules/vue-tsc/bin/vue-tsc.js', 'node_modules/vitest/vitest.mjs'],
  browser: browserScenarios,
  ui: uiScenarios,
  ci: [...new Set([...browserScenarios, ...uiScenarios])],
};

// Approximate seconds from successful Ubuntu Actions runs. These only balance
// work; the suite registry remains the source of truth for coverage.
const ciSeconds = {
  smoke: 137,
  i18n: 100,
  'scroll-stability': 54,
  themes: 49,
  appearance: 49,
  'design-system-states': 47,
  'toolbar-styles': 45,
  'bookmark-styles': 40,
  'search-providers': 30,
  'data-management': 27,
  'mail-indicators': 26,
  'settings-sync': 23,
  'bookmark-dialogs': 21,
  'weather-widget': 18,
  'settings-autosave': 16,
  'design-system-consistency': 14,
  'search-styles': 14,
  'confirmation-dialogs': 12,
  'folder-interaction': 11,
  'apple-guidelines-audit': 11,
};
export function shardScenarios(selected, index, count) {
  assert.ok(Number.isSafeInteger(index) && Number.isSafeInteger(count));
  assert.ok(index >= 1 && index <= count && count <= selected.length, 'Invalid shard');
  const shards = Array.from({ length: count }, () => ({ seconds: 0, scenarios: new Set() }));
  const seconds = (id) => ciSeconds[id] ?? 10;
  for (const id of [...selected].sort((a, b) => seconds(b) - seconds(a))) {
    const shard = shards.reduce((a, b) => (a.seconds <= b.seconds ? a : b));
    shard.scenarios.add(id);
    shard.seconds += seconds(id);
  }
  return selected.filter((id) => shards[index - 1].scenarios.has(id));
}

// Every browser uses the complete CI scenario registry.
export const firefoxScenarios = new Set(suites.ci);

export const scenarioPaths = {
  i18n: 'app/tests/browser/settings/i18n.mjs',
  'settings-sync': 'app/tests/browser/settings/settings-sync.mjs',
  'settings-autosave': 'app/tests/browser/settings/settings-autosave.mjs',
  'mail-indicators': 'app/tests/browser/mail/mail-indicators.mjs',
  'weather-widget': 'app/tests/browser/weather/weather-widget.mjs',
  'data-management': 'app/tests/browser/backup/data-management.mjs',
  themes: 'app/tests/browser/appearance/themes.mjs',
  'theme-startup': 'app/tests/browser/appearance/theme-startup.mjs',
  'wallpaper-startup': 'app/tests/browser/appearance/wallpaper-startup.mjs',
  'movie-search': 'app/tests/browser/search/movie-search.mjs',
  'unified-search': 'app/tests/browser/search/unified-search.mjs',
  'search-providers': 'app/tests/browser/search/search-providers.mjs',
  'browser-parity': 'app/tests/browser/extension/browser-parity.mjs',
  smoke: 'app/tests/browser/extension/smoke.mjs',
  'bookmark-dialogs': 'app/tests/browser/bookmarks/bookmark-dialogs.mjs',
  'folder-interaction': 'app/tests/browser/bookmarks/folder-interaction.mjs',
  'bookmark-drag': 'app/tests/browser/bookmarks/bookmark-drag.mjs',
  'text-tiles': 'app/tests/browser/bookmarks/text-tiles.mjs',
  'confirmation-dialogs': 'app/tests/ui/accessibility/confirmation-dialogs.mjs',
  'keyboard-navigation': 'app/tests/ui/accessibility/keyboard-navigation.mjs',
  'focus-styles': 'app/tests/ui/accessibility/focus-styles.mjs',
  'apple-guidelines-audit': 'app/tests/ui/accessibility/apple-guidelines-audit.mjs',
  'scroll-stability': 'app/tests/ui/appearance/scroll-stability.mjs',
  'vertical-center': 'app/tests/ui/appearance/vertical-center.mjs',
  appearance: 'app/tests/ui/appearance/appearance.mjs',
  'design-system-states': 'app/tests/ui/appearance/design-system-states.mjs',
  'design-system-consistency': 'app/tests/ui/appearance/design-system-consistency.mjs',
  'startup-motion': 'app/tests/ui/appearance/startup-motion.mjs',
  'glass-motion': 'app/tests/ui/appearance/glass-motion.mjs',
  'folder-scroll-layout': 'app/tests/ui/appearance/folder-scroll-layout.mjs',
  'empty-states': 'app/tests/ui/states/empty-states.mjs',
  'search-styles': 'app/tests/ui/search/search-styles.mjs',
  'toolbar-styles': 'app/tests/ui/toolbar/toolbar-styles.mjs',
  'bookmark-styles': 'app/tests/ui/bookmarks/bookmark-styles.mjs',
};
