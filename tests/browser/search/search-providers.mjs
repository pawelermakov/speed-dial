import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  runSharedScenario,
  openExtension,
  selectedBrowsers,
} from '../helpers/extension-driver.mjs';
import { uiAssertions } from '../helpers/ui-assertions.mjs';
const live = process.argv.includes('--live');
const headed = process.argv.includes('--headed');
const out = resolve('.browser-test/search-providers');
await mkdir(out, { recursive: true });
const providers = ['yandex', 'google', 'kinopoisk', 'imdb', 'myshows'];
const names = ['Яндекс', 'Google', 'Закладки', 'Кинопоиск', 'IMDb', 'MyShows'];
const queries = {
  yandex: 'Матрица',
  google: 'привет мир & C++',
  kinopoisk: 'Матрица',
  imdb: 'Matrix',
  myshows: 'Breaking Bad',
};
const hosts = {
  'suggest.yandex.ru': 'yandex',
  'suggestqueries.google.com': 'google',
  'graphql.kinopoisk.ru': 'kinopoisk',
  'v3.sg.media-imdb.com': 'imdb',
  'api.myshows.me': 'myshows',
};
const fixtures = Object.fromEntries(
  await Promise.all(
    providers.map(async (id) => [
      id,
      JSON.parse(await readFile(`modules/dial/modules/search/tests/fixtures/${id}.json`, 'utf8')),
    ]),
  ),
);
const results = [];
async function check(browser, driver, { live = false } = {}) {
  const {
      evaluate,
      poll,
      ready,
      reload,
      resize,
      click,
      fill,
      key,
      routeNetwork,
      observeNetwork,
      errors,
      shot,
      caseDone,
    } = driver,
    ui = uiAssertions(driver),
    select = '.search select',
    input = '.search input',
    requests = [],
    navigation = [],
    network = [],
    responseTasks = [];
  const extensionURL = await driver.url();
  let releaseSlow;
  await observeNetwork((response) => {
    const id = hosts[new URL(response.url).hostname];
    if (!id) return;
    network.push({ provider: id, status: response.status, type: response.contentType });
    if (live && id === 'kinopoisk' && response.text)
      responseTasks.push(
        response
          .text()
          .then((body) => writeFile(resolve(out, browser + '-kinopoisk-live-response.json'), body))
          .catch(() => {}),
      );
  });
  if (!live)
    await routeNetwork(async (request) => {
      const u = new URL(request.url),
        id = hosts[u.hostname];
      if (id) {
        requests.push(id);
        if (u.searchParams.get('q') === 'slow')
          await new Promise((resolve) => {
            releaseSlow = resolve;
          });
        if (u.searchParams.get('q') === 'blocked' || u.pathname.endsWith('/blocked.json'))
          return { status: 403, body: 'blocked' };
        return {
          contentType:
            id === 'yandex' || id === 'google'
              ? 'text/javascript; charset=UTF-8'
              : 'application/json',
          body: JSON.stringify(fixtures[id]),
        };
      }
      if (
        request.isNavigation &&
        [
          'www.yandex.ru',
          'www.google.com',
          'www.kinopoisk.ru',
          'www.imdb.com',
          'myshows.me',
        ].includes(u.hostname)
      ) {
        navigation.push(request.url);
        return { contentType: 'text/html', body: '<title>Search navigation test</title>' };
      }
    });
  await ready();
  await ui.attribute(select, 'aria-label', 'Где искать');
  await ui.disabled(select, false);
  await ui.value(select, 'yandex');
  assert.deepEqual(
    await evaluate(() =>
      [...document.querySelectorAll('.search select option')].map((e) => e.textContent),
    ),
    ['Яндекс', 'Google', 'Закладки'],
  );
  await click('.settings-trigger');
  await click(await ui.byText('.switch-control label', 'Поиск фильмов и сериалов'));
  await key('Escape');
  await ui.count('dialog', 0);
  assert.deepEqual(
    await evaluate(() =>
      [...document.querySelectorAll('.search select option')].map((e) => e.textContent),
    ),
    names,
  );
  await ui.count('.search select optgroup', 0);
  if (!live) caseDone('flat-provider-options');
  const saved = () =>
    evaluate(
      async () =>
        (await (globalThis.browser ?? chrome).storage.local.get('settings')).settings?.value
          .searchProvider ?? 'yandex',
    );
  const back = async () => {
    await reload();
    await ui.disabled(select, false);
  };
  const recordLive = async (id, query, start) => {
    await poll(async () => {
      const visible = await evaluate(
        () => document.querySelectorAll('.suggestions li,.search [role=status]').length,
      );
      return visible > 0 && network.filter((row) => row.provider === id).length > start;
    }).toBe(true);
    const labels = await evaluate(() =>
      [...document.querySelectorAll('.suggestions li')].map((e) => e.textContent),
    );
    const latest = network.filter((row) => row.provider === id).slice(-1),
      success = labels.length > 0 && latest[0].status >= 200 && latest[0].status < 300;
    const row = {
      browser,
      provider: id,
      query,
      status: success ? 'PASS' : 'BLOCKED',
      labels,
      message: await evaluate(() =>
        [...document.querySelectorAll('.search [role=status]')].map((e) => e.textContent).join(''),
      ),
      network: latest,
    };
    results.push(row);
    console.log(row);
  };
  for (const id of providers) {
    await fill(input, '');
    await ui.disabled(select, false);
    await ui.select(select, id);
    await ui.disabled(select, false);
    await poll(saved).toBe(id);
    const start = requests.length,
      networkStart = network.filter((row) => row.provider === id).length;
    await fill(input, queries[id]);
    if (live) await recordLive(id, queries[id], networkStart);
    else {
      await ui.visible('.suggestions li:first-child');
      assert(requests.length > start);
      assert(requests.slice(start).every((source) => source === id));
      const typed = await ui.node(input, (e) => e.value);
      await key('ArrowDown');
      await ui.count('.suggestions [aria-selected=true]', 1);
      await ui.value(input, typed);
      await click('.search-submit');
      await poll(() => driver.url()).not.toBe(extensionURL);
      const target = new URL(navigation.at(-1));
      assert([...target.searchParams.values()].includes(typed));
      await back();
      await ui.value(select, id);
      await ui.disabled(select, false);
      await fill(input, queries[id]);
      await ui.visible('.suggestions li:first-child');
      await key('ArrowDown');
      await key('Enter');
      await poll(() => driver.url()).not.toBe(extensionURL);
      const destination = navigation.at(-1);
      if (id === 'imdb') assert.equal(destination, 'https://www.imdb.com/title/tt0133093/');
      if (id === 'kinopoisk') assert.equal(destination, 'https://www.kinopoisk.ru/film/301/');
      if (id === 'myshows') assert.equal(destination, 'https://myshows.me/view/187/');
      await back();
      caseDone('provider-' + id);
    }
    if (id === 'myshows' && live) {
      const start = network.filter((row) => row.provider === id).length;
      await fill(input, 'Во все тяжкие');
      await recordLive(id, 'Во все тяжкие', start);
    }
  }
  if (live) {
    await Promise.all(responseTasks);
    return;
  }
  await fill(input, '');
  await ui.select(select, 'google');
  await ui.disabled(select, false);
  await fill(input, 'slow');
  await poll(() => typeof releaseSlow).toBe('function');
  await ui.select(select, 'imdb');
  await ui.disabled(select, false);
  await ui.value(input, 'slow');
  await ui.containsText('.suggestions li:first-child', 'The Matrix');
  releaseSlow();
  await key('Escape');
  await ui.count('.suggestions', 0);
  await fill(input, 'blocked');
  await ui.containsText('.search [role=status]', 'Подсказки временно недоступны');
  await click('.search-submit');
  await poll(() => driver.url()).not.toBe(extensionURL);
  assert.equal(navigation.at(-1), 'https://www.imdb.com/find/?q=blocked');
  await back();
  caseDone('stale-cancellation-and-errors');
  await evaluate(async () => {
    const api = globalThis.browser ?? chrome,
      { settings } = await api.storage.local.get('settings');
    settings.value.searchProvider = 'unknown';
    await api.storage.local.set({ settings });
  });
  await back();
  await ui.value(select, 'yandex');
  caseDone('unknown-provider-fallback');
  for (const [width, height] of [
    [360, 800],
    [1280, 800],
    [1920, 1080],
  ]) {
    await resize(width, height);
    for (const id of providers) {
      await fill(input, '');
      await ui.disabled(select, false);
      await ui.select(select, id);
      await ui.disabled(select, false);
      await fill(input, queries[id]);
      await ui.visible('.suggestions li:first-child');
      const a = await ui.rect(select),
        b = await ui.rect(input),
        c = await ui.rect('.search-submit');
      assert(a.x + a.width <= b.x + 1);
      assert(b.x + b.width <= c.x + 1);
      assert(b.width > 60);
      assert.equal(await evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await shot(`${id}-${width}`);
    }
    caseDone('layout-' + width);
  }
  assert.deepEqual(await errors(), []);
  console.log(
    'PASS ' +
      browser +
      ' full provider UI: flat select, persistence, native HTTP request isolation/navigation, raw query/direct links, stale cancellation, failures and 15 layouts',
  );
}
if (live) {
  for (const browser of selectedBrowsers()) {
    const driver = await openExtension(browser, { network: true, headless: !headed });
    try {
      await check(browser, driver, { live: true });
    } finally {
      await driver.close();
    }
  }
  await writeFile(
    resolve(out, headed ? 'live-headed-results.json' : 'live-results.json'),
    JSON.stringify({ checkedAt: new Date().toISOString(), headless: !headed, results }, null, 2),
  );
  assert.equal(
    results.length,
    selectedBrowsers().length * 6,
    'Every provider/query must run on each selected browser',
  );
  if (results.some((row) => row.status === 'BLOCKED')) process.exitCode = 2;
} else
  await runSharedScenario('search-providers', check, { launchOptions: () => ({ network: true }) });
