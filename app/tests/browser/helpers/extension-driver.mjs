import { chromium, expect } from '@playwright/test';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, sep, basename } from 'node:path';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { launchFirefox, firefoxUrl } from './firefox-driver.mjs';
import {
  requiredCases,
  requiredArtifacts,
  scenarioReportPath,
  validateScenarioReport,
} from '../../scenarios.mjs';

export function gateStartupHtml(html) {
  const modules = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)];
  assert.equal(modules.length, 1, 'exactly one production app entry must be gated');
  return html.replace(
    modules[0][0],
    modules[0][0].replace(
      'type="module"',
      'type="application/x-test-gated-module" data-test-app-gate',
    ),
  );
}

export async function startupFixture(browser) {
  assert.ok(['chrome', 'firefox'].includes(browser));
  const source = resolve(`.output/${browser === 'chrome' ? 'chrome-mv3' : 'firefox-mv2'}`);
  const destination = resolve('.browser-test', `startup-build-${browser}-${crypto.randomUUID()}`);
  await cp(source, destination, { recursive: true });
  const path = resolve(destination, 'newtab.html');
  const html = await readFile(path, 'utf8');
  const modules = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)];
  assert.equal(modules.length, 1, 'exactly one production app entry must be gated');
  assert.ok((await readFile(resolve(destination, modules[0][1].slice(1)))).length > 0);
  await writeFile(path, gateStartupHtml(html));
  return destination;
}
export async function instrumentedFixture(browser, name, prelude) {
  assert.match(name, /^[a-z][a-z0-9-]*$/);
  assert.equal(typeof prelude, 'function');
  const destination = await startupFixture(browser),
    path = resolve(destination, 'newtab.html');
  const html = await readFile(path, 'utf8');
  assert.equal([...html.matchAll(/<head>/g)].length, 1);
  const filename = `test-${name}-prelude.js`;
  await writeFile(path, html.replace('<head>', `<head><script src="/${filename}"></script>`));
  await writeFile(resolve(destination, filename), `(${prelude})();`);
  return destination;
}

export function selectedBrowsers() {
  if (process.argv.includes('--chrome-only') && process.argv.includes('--firefox-only'))
    throw Error('Choose one browser');
  return ['chrome', 'firefox'].filter(
    (name) => !process.argv.includes(name === 'chrome' ? '--firefox-only' : '--chrome-only'),
  );
}

export async function openExtension(
  browser,
  {
    extension,
    gated = false,
    locale = 'ru-RU',
    deviceScaleFactor = 1,
    network = false,
    headless = true,
    extensionDebugging = false,
    sizeBeforeNavigation = false,
    profile,
  } = {},
) {
  assert.ok(['chrome', 'firefox'].includes(browser));
  let context, page, peerPage, ff, url, cdp, mainHandle, peerHandle, currentHandle, worker;
  profile ??= resolve('.browser-test', `shared-${browser}-${crypto.randomUUID()}`);
  profile = resolve(profile);
  assert.ok(profile.startsWith(resolve('.browser-test') + sep), 'Use an isolated test profile');
  const pageErrors = [];
  try {
    if (browser === 'chrome') {
      extension ??= resolve('.output/chrome-mv3');
      context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless,
        locale,
        colorScheme: 'light',
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor,
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
          ...(extensionDebugging ? ['--enable-unsafe-extension-debugging'] : []),
          ...(headless ? [] : ['--start-minimized']),
        ],
      });
      context.setDefaultTimeout(12000);
      worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      url = worker.url().replace('background.js', 'newtab.html');
      page = await context.newPage();
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('dialog', (dialog) => {
        pageErrors.push('Unexpected system dialog: ' + dialog.type());
        void dialog.dismiss();
      });
    } else {
      ff = await launchFirefox(profile, locale, extension, { network, headless });
      url = firefoxUrl;
      await ff.command('WebDriver:SetWindowRect', { width: 1280, height: 800 });
    }
  } catch (error) {
    if (ff) await ff.close();
    else if (context) await context.close();
    throw error;
  }
  const evaluate = (fn, ...args) => {
    assert.ok(args.length <= 1, 'Driver accepts one serialized argument');
    return browser === 'chrome'
      ? page.evaluate(fn, args[0])
      : ff
          .exec(
            `const value = await (${fn.toString()})(...arguments[0]);return { defined: value !== undefined, value: value === undefined ? null : value };`,
            args,
          )
          .then((result) => (result.defined ? result.value : undefined));
  };
  const evaluateIn = (target, fn, arg) =>
    browser === 'chrome' && target === 'peer' ? peerPage.evaluate(fn, 'self') : evaluate(fn, arg);
  const poll = (fn, message) => expect.poll(fn, { timeout: 12000, message });
  async function resize(width, height) {
    if (browser === 'chrome') return page.setViewportSize({ width, height });
    await ff.command('WebDriver:SetWindowRect', {
      width: Math.max(width, 1280),
      height: Math.max(height, 800) + 200,
    });
    // Firefox's desktop window has a minimum width. Size its real content browser
    // independently so narrow layout cases exercise the requested CSS viewport.
    await privileged(
      ({ width, height }) => {
        const content =
          globalThis.Services.wm.getMostRecentWindow('navigator:browser').gBrowser.selectedBrowser;
        for (const [axis, value] of Object.entries({ width, height })) {
          content.style.setProperty(axis, `${value}px`);
          content.style.setProperty(`min-${axis}`, `${value}px`);
          content.style.setProperty(`max-${axis}`, `${value}px`);
        }
      },
      { width, height },
    );
    await poll(() => evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
      width,
      height,
    });
  }
  const ready = (target = 'self') =>
    poll(() =>
      evaluateIn(
        target,
        (target) => {
          const doc = target === 'peer' ? window.testPeer.document : document;
          return (
            !!doc.querySelector('.settings-trigger') &&
            !doc.querySelector('.settings-trigger').disabled
          );
        },
        target,
      ),
    ).toBe(true);
  async function releaseApp(target = 'self', { waitUntilReady = true } = {}) {
    await evaluateIn(
      target,
      (target) => {
        const doc = target === 'peer' ? window.testPeer.document : document;
        const gate = doc.querySelector('script[data-test-app-gate]');
        if (!gate || gate.type !== 'application/x-test-gated-module')
          throw Error('Missing app gate');
        const app = doc.createElement('script');
        for (const attribute of gate.attributes)
          if (!['type', 'data-test-app-gate'].includes(attribute.name))
            app.setAttribute(attribute.name, attribute.value);
        app.type = 'module';
        gate.replaceWith(app);
      },
      target,
    );
    if (waitUntilReady) await ready(target);
  }
  async function navigate() {
    if (browser === 'chrome') await page.goto(url);
    else await ff.command('WebDriver:Navigate', { url });
    if (gated)
      await poll(() =>
        evaluate(
          () =>
            !!document.querySelector('script[data-test-app-gate]') &&
            !!document.querySelector('link[rel=stylesheet]')?.sheet,
        ),
      ).toBe(true);
    else await ready();
  }
  async function key(value) {
    if (browser === 'chrome') return page.keyboard.press(value);
    const keys = {
      Tab: '\uE004',
      Escape: '\uE00C',
      Shift: '\uE008',
      Control: '\uE009',
      Backspace: '\uE003',
      Home: '\uE011',
      End: '\uE010',
      F10: '\uE03A',
      Enter: '\uE006',
      ArrowDown: '\uE015',
      ArrowUp: '\uE013',
      Space: ' ',
    };
    const parts = value.split('+').map((p) => keys[p] ?? p);
    await ff.command('WebDriver:PerformActions', {
      actions: [
        {
          type: 'key',
          id: 'keyboard',
          actions: [
            ...parts.map((value) => ({ type: 'keyDown', value })),
            ...parts.toReversed().map((value) => ({ type: 'keyUp', value })),
          ],
        },
      ],
    });
  }
  async function privileged(fn, ...args) {
    await ff.command('Marionette:SetContext', { value: 'chrome' });
    try {
      return await ff.exec(`return await (${fn.toString()})(...arguments[0]);`, args);
    } finally {
      await ff.command('Marionette:SetContext', { value: 'content' });
    }
  }
  async function inPeer(action) {
    await selectHandle(peerHandle);
    try {
      return await action();
    } finally {
      await selectHandle(mainHandle);
    }
  }
  async function selectHandle(handle) {
    assert.ok(handle, 'A real browsing context is required');
    if (currentHandle !== handle) {
      await ff.command('WebDriver:SwitchToWindow', { handle });
      currentHandle = handle;
    }
  }
  async function media({
    colorScheme = 'light',
    forcedColors = 'none',
    contrast = forcedColors === 'active' ? 'more' : 'no-preference',
    transparency = 'no-preference',
    reducedMotion = 'no-preference',
    enableTransparencyFeature = true,
  } = {}) {
    const features = {
      'prefers-color-scheme': colorScheme,
      'prefers-contrast': contrast,
      'prefers-reduced-transparency': transparency,
      'forced-colors': forcedColors,
      'prefers-reduced-motion': reducedMotion,
    };
    let metadata = { transparencyFeatureEnabledForTest: false, transparencyAvailable: true };
    if (browser === 'chrome') {
      cdp ??= await context.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', {
        features: Object.entries(features).map(([name, value]) => ({ name, value })),
      });
    } else {
      metadata = await privileged(
        (options) => {
          globalThis.Services.prefs.setBoolPref('browser.display.use_system_colors', false);
          globalThis.Services.prefs.setCharPref(
            'browser.display.background_color',
            options.colorScheme === 'dark' ? '#000000' : '#ffffff',
          );
          globalThis.Services.prefs.setCharPref(
            'browser.display.foreground_color',
            options.colorScheme === 'dark' ? '#ffffff' : '#000000',
          );
          const feature = 'layout.css.prefers-reduced-transparency.enabled';
          const enabled = globalThis.Services.prefs.getBoolPref(feature, false);
          const activate = options.transparency === 'reduce' && options.enableTransparencyFeature;
          if (activate) globalThis.Services.prefs.setBoolPref(feature, true);
          globalThis.Services.prefs.setIntPref(
            'layout.css.prefers-color-scheme.content-override',
            options.colorScheme === 'dark' ? 0 : 1,
          );
          globalThis.Services.prefs.setIntPref(
            'ui.useAccessibilityTheme',
            options.contrast === 'more' ? 1 : 0,
          );
          globalThis.Services.prefs.setIntPref(
            'browser.display.document_color_use',
            options.forcedColors === 'active' ? 2 : 1,
          );
          globalThis.Services.prefs.setIntPref(
            'ui.prefersReducedTransparency',
            options.transparency === 'reduce' ? 1 : 0,
          );
          globalThis.Services.prefs.setIntPref(
            'ui.prefersReducedMotion',
            options.reducedMotion === 'reduce' ? 1 : 0,
          );
          return {
            transparencyFeatureEnabledForTest: activate && !enabled,
            transparencyAvailable: enabled || activate,
          };
        },
        {
          colorScheme,
          contrast,
          transparency,
          forcedColors,
          reducedMotion,
          enableTransparencyFeature,
        },
      );
    }
    for (const [name, value] of Object.entries(features))
      await poll(
        () => evaluate((query) => matchMedia(query).matches, `(${name}: ${value})`),
        `${name}: ${value}`,
      ).toBe(name === 'prefers-reduced-transparency' ? metadata.transparencyAvailable : true);
    if (ff && metadata.transparencyFeatureEnabledForTest) {
      await evaluate(async () => {
        await Promise.all(
          [...document.querySelectorAll('link[rel=stylesheet]')].map(
            (link) =>
              new Promise((resolve, reject) => {
                link.onload = resolve;
                link.onerror = () => reject(Error('Stylesheet reload failed'));
                link.href = new URL(link.href).pathname + '?test-transparency=enabled';
              }),
          ),
        );
      });
    }
    return metadata;
  }

  try {
    if (browser === 'firefox')
      await privileged(
        (base) => {
          const owner = globalThis.Services.wm.getMostRecentWindow('navigator:browser');
          owner.testScriptErrors = [];
          owner.testScriptErrorListener = {
            observe(message) {
              if (
                message instanceof globalThis.Components.interfaces.nsIScriptError &&
                message.sourceName.startsWith(base) &&
                // Match Playwright pageerror: application exceptions/rejections,
                // excluding XPConnect diagnostics emitted after a realm unloads.
                message.category === 'content javascript' &&
                !(message.flags & 1)
              )
                owner.testScriptErrors.push(message.errorMessage);
            },
          };
          globalThis.Services.console.registerListener(owner.testScriptErrorListener);
        },
        url.slice(0, url.lastIndexOf('/') + 1),
      );
    if (browser === 'firefox' && deviceScaleFactor !== 1)
      await privileged(
        (value) =>
          globalThis.Services.prefs.setCharPref('layout.css.devPixelsPerPx', String(value)),
        deviceScaleFactor,
      );
    if (sizeBeforeNavigation) await resize(1280, 800);
    await navigate();
    if (!sizeBeforeNavigation) await resize(1280, 800);
  } catch (error) {
    await (ff ? ff.close() : context.close());
    throw error;
  }
  let mainPage = page;
  if (ff) currentHandle = mainHandle = await ff.command('WebDriver:GetWindowHandle');
  const scope = new AsyncLocalStorage();
  let queue = Promise.resolve();
  const runInTarget = (target, action) => {
    if (scope.getStore() === target) return action();
    const pending = queue.then(() =>
      scope.run(target, async () => {
        if (ff) await selectHandle(target === 'peer' ? peerHandle : mainHandle);
        else page = target === 'peer' ? peerPage : mainPage;
        return action();
      }),
    );
    queue = pending.catch(() => {});
    return pending;
  };
  const driver = {
    browser,
    profile,
    async reloadChromeExtension() {
      assert.equal(browser, 'chrome');
      assert.ok(extensionDebugging, 'Enable native extension debugging for release checks');
      const previousPage = mainPage;
      const survivor = await context.newPage();
      const session = await context.browser().newBrowserCDPSession();
      try {
        const result = await session.send('Extensions.loadUnpacked', { path: resolve(extension) });
        assert.equal(result.id, new URL(url).hostname);
      } finally {
        await session.detach();
      }
      mainPage = page = survivor;
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('dialog', (dialog) => {
        pageErrors.push('Unexpected system dialog: ' + dialog.type());
        void dialog.dismiss();
      });
      if (!previousPage.isClosed()) await previousPage.close();
      await navigate();
      worker = context
        .serviceWorkers()
        .find((value) => value.url() === new URL('background.js', url).href);
      assert.ok(worker, 'Updated extension background must be active');
    },
    async installFirefoxExtension(extension) {
      assert.equal(browser, 'firefox');
      // Updating an add-on closes its old extension tabs. Keep a normal tab so
      // this isolated browser window and the Marionette session remain alive.
      const survivor = await ff.command('WebDriver:NewWindow', { type: 'tab' });
      await selectHandle(survivor.handle);
      await ff.command('Addon:Install', { path: resolve(extension), temporary: true });
      const handles = await ff.command('WebDriver:GetWindowHandles');
      assert.ok(handles.length, 'Upgrade must retain a browser window');
      mainHandle = handles.includes(mainHandle) ? mainHandle : handles[0];
      currentHandle = undefined;
      await selectHandle(mainHandle);
      await navigate();
    },
    async evaluateBackground(fn, arg) {
      if (browser === 'chrome')
        return worker.evaluate(
          new Function('arg', 'return (' + fn + ')(globalThis.browser ?? chrome, arg)'),
          arg,
        );
      return ff.exec(
        'const bg = await browser.runtime.getBackgroundPage();return await (' +
          fn +
          ')(bg.browser, arguments[0]);',
        arg,
      );
    },
    async deliverNativeFolder({ guid, title }) {
      assert.equal(browser, 'firefox', 'Native GUID delivery is a Firefox capability');
      await privileged(
        async ({ guid, title }) => {
          const { PlacesUtils } = globalThis.ChromeUtils.importESModule(
            'resource://gre/modules/PlacesUtils.sys.mjs',
          );
          await PlacesUtils.bookmarks.insert({
            guid,
            parentGuid: PlacesUtils.bookmarks.unfiledGuid,
            title,
            type: PlacesUtils.bookmarks.TYPE_FOLDER,
          });
        },
        { guid, title },
      );
    },
    async newPeer() {
      await facade.openPeer();
      return peerFacade;
    },
    errors: async () =>
      browser === 'chrome'
        ? [...pageErrors]
        : [
            ...(await privileged(
              () =>
                globalThis.Services.wm.getMostRecentWindow('navigator:browser').testScriptErrors,
            )),
            ...(ff.network?.errors() ?? []),
          ],
    url: () => (browser === 'chrome' ? page.url() : ff.command('WebDriver:GetCurrentURL')),
    async routeNetwork(handler) {
      if (ff) {
        assert.ok(ff.network, 'Launch the Firefox session with network support');
        return ff.network.route(handler);
      }
      await context.route('**/*', async (route) => {
        const request = route.request();
        const response = await handler({
          url: request.url(),
          method: request.method(),
          isNavigation: request.isNavigationRequest(),
        });
        if (!response) {
          await route.continue();
          return;
        }
        assert.equal(typeof response.body, 'string');
        await route
          .fulfill({
            status: response.status ?? 200,
            contentType: response.contentType ?? 'application/json',
            body: response.body,
          })
          .catch(() => {});
      });
    },
    observeNetwork(handler) {
      if (ff) {
        assert.ok(ff.network, 'Launch the Firefox session with network support');
        ff.network.observe(handler);
      } else
        context.on('response', (response) => {
          void Promise.resolve(
            handler({
              url: response.url(),
              status: response.status(),
              contentType: response.headers()['content-type'] ?? null,
              text: () => response.text(),
            }),
          ).catch((error) => pageErrors.push(error.message));
        });
      if (!ff)
        context.on('requestfailed', (request) => {
          void Promise.resolve(
            handler({
              url: request.url(),
              status: 0,
              contentType: null,
              failure: request.failure()?.errorText,
            }),
          ).catch((error) => pageErrors.push(error.message));
        });
    },
    async coarsePointer(value = true) {
      if (browser === 'chrome') {
        cdp ??= await context.newCDPSession(page);
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: value });
      } else
        await privileged((value) => {
          for (const name of ['ui.primaryPointerCapabilities', 'ui.allPointerCapabilities'])
            globalThis.Services.prefs.setIntPref(name, value ? 1 : 6);
        }, value);
      await poll(() => evaluate(() => matchMedia('(pointer:coarse)').matches)).toBe(value);
    },
    async openPeer() {
      if (browser === 'chrome') {
        peerPage = await context.newPage();
        peerPage.on('pageerror', (error) => pageErrors.push(error.message));
        peerPage.on('dialog', (dialog) => {
          pageErrors.push('Unexpected system dialog: ' + dialog.type());
          void dialog.dismiss();
        });
        await peerPage.goto(url);
      } else {
        mainHandle = await ff.command('WebDriver:GetWindowHandle');
        const existing = await ff.command('WebDriver:GetWindowHandles');
        await evaluate(() => {
          const b = document.createElement('button');
          b.id = 'test-open-peer';
          b.textContent = 'Open peer';
          b.style.cssText =
            'position:fixed;top:10px;left:10px;z-index:99999;padding:10px;background:white;color:black';
          b.addEventListener('click', () => {
            window.testPeer = window.open(browser.runtime.getURL('newtab.html'));
          });
          document.body.append(b);
        });
        const element = await ff.command('WebDriver:FindElement', {
          using: 'css selector',
          value: '#test-open-peer',
        });
        await ff.command('WebDriver:ElementClick', {
          id: element['element-6066-11e4-a52e-4f735466cecf'],
        });
        await poll(() =>
          evaluate(
            (gated) =>
              !!window.testPeer?.document.querySelector(
                gated ? 'script[data-test-app-gate]' : '#app',
              ),
            gated,
          ),
        ).toBe(true);
        const handles = await ff.command('WebDriver:GetWindowHandles');
        peerHandle = handles.find((handle) => !existing.includes(handle));
        assert.ok(peerHandle, 'A real peer browsing context must open');
        await inPeer(() => resize(1280, 800));
      }
    },
    evaluatePeer: (fn, arg) =>
      browser === 'chrome'
        ? peerPage.evaluate(fn, arg)
        : inPeer(() => ff.exec(`return await (${fn.toString()})(arguments[0]);`, arg)),
    peerTheme: () =>
      browser === 'chrome'
        ? peerPage.evaluate(() => document.documentElement.dataset.theme)
        : evaluate(() => window.testPeer.document.documentElement.dataset.theme),
    async closePeer() {
      if (browser === 'chrome') await peerPage.close();
      else
        await evaluate(() => {
          window.testPeer.close();
          document.querySelector('#test-open-peer').remove();
        });
    },
    evaluate,
    async mockFetch(hostname, { body, status = 200, contentType = 'application/json' }) {
      await evaluate(
        ({ hostname, body, status, contentType }) => {
          if (!window.testFetchFixtures) {
            window.testFetchFixtures = {};
            const original = window.fetch.bind(window);
            window.fetch = (input, options) => {
              const address = input instanceof Request ? input.url : String(input);
              const fixture = window.testFetchFixtures[new URL(address, location.href).hostname];
              if (!fixture) return original(input, options);
              const signal =
                options?.signal ?? (input instanceof Request ? input.signal : undefined);
              if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
              return Promise.resolve(
                new Response(fixture.body, {
                  status: fixture.status,
                  headers: { 'content-type': fixture.contentType },
                }),
              );
            };
          }
          window.testFetchFixtures[hostname] = { body, status, contentType };
        },
        { hostname, body, status, contentType },
      );
    },
    async download(action) {
      if (browser === 'chrome') {
        const event = page.waitForEvent('download');
        await action();
        const download = await event;
        try {
          const stream = await download.createReadStream(),
            chunks = [];
          assert.ok(stream, 'Native download must provide its bytes');
          for await (const chunk of stream) chunks.push(chunk);
          return { filename: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
        } finally {
          await download.delete();
        }
      }
      const directory = resolve(ff.profile, 'downloads');
      await mkdir(directory, { recursive: true });
      await privileged((directory) => {
        const prefs = globalThis.Services.prefs;
        prefs.setIntPref('browser.download.folderList', 2);
        prefs.setCharPref('browser.download.dir', directory);
        prefs.setBoolPref('browser.download.useDownloadDir', true);
        prefs.setBoolPref('browser.download.alwaysOpenPanel', false);
        prefs.setCharPref('browser.helperApps.neverAsk.saveToDisk', 'application/json');
      }, directory);
      const completed = () =>
        privileged(async () => {
          const { Downloads } = globalThis.ChromeUtils.importESModule(
            'resource://gre/modules/Downloads.sys.mjs',
          );
          return (await (await Downloads.getList(Downloads.ALL)).getAll())
            .filter((item) => item.succeeded)
            .map((item) => ({
              key: item.source.url + '\n' + item.startTime.getTime(),
              path: item.target.path,
            }));
        });
      const previous = (await completed()).map((item) => item.key);
      await action();
      let path;
      await poll(async () => {
        const paths = (await completed())
          .filter((item) => !previous.includes(item.key))
          .map((item) => item.path);
        assert.ok(paths.length <= 1, 'Only one native download must start');
        path = paths[0];
        return !!path;
      }).toBe(true);
      assert.ok(
        resolve(path).startsWith(directory + sep),
        'Native test download must stay in its isolated profile',
      );
      try {
        return { filename: basename(path), bytes: await readFile(path) };
      } finally {
        await rm(path, { force: true });
      }
    },
    poll,
    ready,
    releaseApp,
    media,
    key,
    reload: navigate,
    resize,
    async offline(value) {
      if (browser === 'chrome') await context.setOffline(value);
      else
        await privileged((value) => {
          globalThis.Services.io.manageOfflineStatus = false;
          globalThis.Services.io.offline = value;
        }, value);
      await poll(() => evaluate(() => navigator.onLine)).toBe(!value);
    },
    async hover(selector) {
      if (browser === 'chrome') return page.locator(selector).hover();
      const point = await evaluate((selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { x: Math.floor(r.x + r.width / 2), y: Math.floor(r.y + r.height / 2) };
      }, selector);
      await ff.command('WebDriver:PerformActions', {
        actions: [
          {
            type: 'pointer',
            id: 'mouse',
            parameters: { pointerType: 'mouse' },
            actions: [{ type: 'pointerMove', origin: 'viewport', duration: 0, ...point }],
          },
        ],
      });
    },
    async movePointer(x, y) {
      if (browser === 'chrome') return page.mouse.move(x, y);
      await ff.command('WebDriver:PerformActions', {
        actions: [
          {
            type: 'pointer',
            id: 'mouse',
            parameters: { pointerType: 'mouse' },
            actions: [{ type: 'pointerMove', origin: 'viewport', duration: 0, x, y }],
          },
        ],
      });
    },
    async pointerButton(pressed, button = 'left') {
      assert.ok(['left', 'middle', 'right'].includes(button));
      if (browser === 'chrome') return page.mouse[pressed ? 'down' : 'up']({ button });
      await ff.command('WebDriver:PerformActions', {
        actions: [
          {
            type: 'pointer',
            id: 'mouse',
            parameters: { pointerType: 'mouse' },
            actions: [
              {
                type: pressed ? 'pointerDown' : 'pointerUp',
                button: { left: 0, middle: 1, right: 2 }[button],
              },
            ],
          },
        ],
      });
    },
    async dragTo(source, target, { sourcePosition, targetPosition, cancel = false } = {}) {
      if (browser === 'chrome' && !cancel)
        return page
          .locator(source)
          .dragTo(page.locator(target), { sourcePosition, targetPosition });
      await poll(() =>
        evaluate((selector) => {
          const e = document.querySelector(selector);
          return !!e && e.draggable && !e.matches(':disabled');
        }, source),
      ).toBe(true);
      await evaluate(
        (selector) =>
          document.querySelector(selector).scrollIntoView({ block: 'nearest', inline: 'nearest' }),
        source,
      );
      let previous;
      await poll(async () => {
        const result = await evaluate(
          ({ source, sourcePosition }) => {
            const e = document.querySelector(source),
              r = e.getBoundingClientRect();
            const x = r.x + (sourcePosition?.x ?? r.width / 2),
              y = r.y + (sourcePosition?.y ?? r.height / 2);
            return {
              rect: JSON.stringify([r.x, r.y, r.width, r.height]),
              hit: e.contains(document.elementFromPoint(x, y)),
            };
          },
          { source, sourcePosition },
        );
        const stable = previous === result.rect;
        previous = result.rect;
        return stable && result.hit;
      }).toBe(true);
      const points = await evaluate(
        ({ source, target, sourcePosition, targetPosition }) => {
          const a = document.querySelector(source).getBoundingClientRect();
          const b = document.querySelector(target).getBoundingClientRect();
          const point = (r, p) => ({
            x: Math.round(r.x + (p?.x ?? r.width / 2)),
            y: Math.round(r.y + (p?.y ?? r.height / 2)),
          });
          return { from: point(a, sourcePosition), to: point(b, targetPosition) };
        },
        { source, target, sourcePosition, targetPosition },
      );
      if (browser === 'firefox') return ff.drag(points.from, points.to, { cancel });
      await page.mouse.move(points.from.x, points.from.y);
      await page.mouse.down();
      await page.mouse.move(points.to.x, points.to.y, { steps: 20 });
      await page.keyboard.press('Escape');
      await page.mouse.up();
    },
    async clickAt(x, y, { button = 'left' } = {}) {
      assert.ok(['left', 'right', 'middle'].includes(button));
      if (browser === 'chrome') return page.mouse.click(x, y, { button });
      const code = { left: 0, middle: 1, right: 2 }[button];
      await ff.command('WebDriver:PerformActions', {
        actions: [
          {
            type: 'pointer',
            id: 'mouse',
            parameters: { pointerType: 'mouse' },
            actions: [
              { type: 'pointerMove', origin: 'viewport', duration: 0, x, y },
              { type: 'pointerDown', button: code },
              { type: 'pointerUp', button: code },
            ],
          },
        ],
      });
    },
    async wheel(x, y, deltaY) {
      if (browser === 'chrome') {
        await page.mouse.move(x, y);
        await page.mouse.wheel(0, deltaY);
      } else
        await ff.command('WebDriver:PerformActions', {
          actions: [
            {
              type: 'wheel',
              id: 'wheel',
              actions: [
                {
                  type: 'scroll',
                  x: Math.round(x),
                  y: Math.round(y),
                  deltaX: 0,
                  deltaY,
                  duration: 100,
                },
              ],
            },
          ],
        });
      // Preserve the existing wheel adapter's settling interval on both platforms.
      await new Promise((resolve) => setTimeout(resolve, 250));
    },
    async click(selector, { button = 'left', position } = {}) {
      assert.ok(['left', 'middle', 'right'].includes(button));
      if (browser === 'chrome') return page.locator(selector).click({ button, position });
      await poll(() =>
        evaluate((selector) => {
          const e = document.querySelector(selector);
          return !!e && !e.matches(':disabled') && e.getClientRects().length > 0;
        }, selector),
      ).toBe(true);
      await evaluate((selector) => {
        document
          .querySelector(selector)
          .scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      }, selector);
      let previous;
      await poll(async () => {
        const rect = await evaluate((selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return JSON.stringify([r.x, r.y, r.width, r.height]);
        }, selector);
        const stable = rect === previous;
        previous = rect;
        return stable;
      }).toBe(true);
      let point;
      await poll(() =>
        evaluate(
          ({ selector, position }) => {
            const e = document.querySelector(selector),
              r = e.getBoundingClientRect();
            let left = Math.max(0, r.left),
              right = Math.min(innerWidth, r.right),
              top = Math.max(0, r.top),
              bottom = Math.min(innerHeight, r.bottom);
            for (let parent = e.parentElement; parent; parent = parent.parentElement) {
              const style = getComputedStyle(parent),
                bounds = parent.getBoundingClientRect();
              const sx = parent.offsetWidth ? bounds.width / parent.offsetWidth : 1,
                sy = parent.offsetHeight ? bounds.height / parent.offsetHeight : 1;
              if (/^(hidden|clip|auto|scroll)$/.test(style.overflowX)) {
                const edge = bounds.left + parent.clientLeft * sx;
                left = Math.max(left, edge);
                right = Math.min(right, edge + parent.clientWidth * sx);
              }
              if (/^(hidden|clip|auto|scroll)$/.test(style.overflowY)) {
                const edge = bounds.top + parent.clientTop * sy;
                top = Math.max(top, edge);
                bottom = Math.min(bottom, edge + parent.clientHeight * sy);
              }
            }
            const x = Math.floor(position ? r.x + position.x : (left + right) / 2),
              y = Math.floor(position ? r.y + position.y : (top + bottom) / 2);
            return {
              point: { x, y },
              hit: left < right && top < bottom && e.contains(document.elementFromPoint(x, y)),
            };
          },
          { selector, position },
        ).then((result) => {
          point = result.point;
          return result.hit;
        }),
      ).toBe(true);
      const code = { left: 0, middle: 1, right: 2 }[button];
      await ff.command('WebDriver:PerformActions', {
        actions: [
          {
            type: 'pointer',
            id: 'mouse',
            parameters: { pointerType: 'mouse' },
            actions: [
              { type: 'pointerMove', origin: 'viewport', duration: 0, ...point },
              { type: 'pointerDown', button: code },
              { type: 'pointerUp', button: code },
            ],
          },
        ],
      });
    },
    async setInputFiles(selector, path) {
      if (browser === 'chrome') return page.locator(selector).setInputFiles(path);
      await poll(() =>
        evaluate((selector) => document.querySelectorAll(selector).length, selector),
      ).toBe(1);
      const element = await ff.command('WebDriver:FindElement', {
        using: 'css selector',
        value: selector,
      });
      await ff.command('WebDriver:ElementSendKeys', {
        id: element['element-6066-11e4-a52e-4f735466cecf'],
        text: resolve(path),
      });
    },
    async fill(selector, text) {
      if (browser === 'chrome') return page.locator(selector).fill(text);
      await poll(() =>
        evaluate((selector) => document.querySelectorAll(selector).length, selector),
      ).toBe(1);
      const element = await ff.command('WebDriver:FindElement', {
        using: 'css selector',
        value: selector,
      });
      const id = element['element-6066-11e4-a52e-4f735466cecf'];
      // Focus the actual native element, then clear and type in one input batch.
      // Global commands separated by protocol round trips can lose their target.
      await ff.command('WebDriver:ElementSendKeys', { id, text: '' });
      await ff.command('WebDriver:PerformActions', {
        actions: [
          {
            type: 'key',
            id: 'keyboard',
            actions: [
              { type: 'keyDown', value: '\uE009' },
              { type: 'keyDown', value: 'a' },
              { type: 'keyUp', value: 'a' },
              { type: 'keyUp', value: '\uE009' },
              { type: 'keyDown', value: '\uE003' },
              { type: 'keyUp', value: '\uE003' },
              ...[...text].flatMap((value) => [
                { type: 'keyDown', value },
                { type: 'keyUp', value },
              ]),
            ],
          },
        ],
      });
      await poll(() =>
        evaluate((selector) => document.querySelector(selector)?.value, selector),
      ).toBe(text);
    },
    async screenshot(path, { selector, clip, peer = false } = {}) {
      await mkdir(resolve(path, '..'), { recursive: true });
      assert.ok(!selector || !clip, 'Choose an element or a clip');
      if (browser === 'chrome') {
        const target = peer ? peerPage : page;
        if (selector) await target.locator(selector).screenshot({ path });
        else await target.screenshot({ path, clip });
      } else {
        const capture = async () => {
          let marker;
          if (clip) {
            for (const name of ['x', 'y', 'width', 'height'])
              assert.ok(Number.isFinite(clip[name]));
            assert.ok(clip.width > 0 && clip.height > 0);
            marker = 'test-screenshot-' + crypto.randomUUID();
            await evaluate(
              ({ clip, marker }) => {
                const e = document.createElement('div');
                e.id = marker;
                e.style.cssText = `all:initial;display:block;position:fixed;left:${clip.x}px;top:${clip.y}px;width:${clip.width}px;height:${clip.height}px;pointer-events:none;background:transparent;border:0;margin:0;padding:0`;
                document.documentElement.append(e);
              },
              { clip, marker },
            );
            selector = '#' + marker;
          }
          try {
            const element = selector
              ? await ff.command('WebDriver:FindElement', {
                  using: 'css selector',
                  value: selector,
                })
              : null;
            await writeFile(
              path,
              Buffer.from(
                await ff.command(
                  'WebDriver:TakeScreenshot',
                  element
                    ? {
                        id: element['element-6066-11e4-a52e-4f735466cecf'],
                      }
                    : {},
                ),
                'base64',
              ),
            );
          } finally {
            if (marker) await evaluate((id) => document.getElementById(id)?.remove(), marker);
          }
        };
        if (peer) await inPeer(capture);
        else await capture();
      }
    },
    close: () => (ff ? ff.close() : context.close()),
  };
  const makeFacade = (target) =>
    new Proxy(driver, {
      get(object, name) {
        if (name === 'close' && target === 'peer') return () => facade.closePeer();
        const value = object[name];
        if (typeof value !== 'function' || name === 'poll' || name === 'close') return value;
        return (...args) => runInTarget(target, () => value(...args));
      },
    });
  const facade = makeFacade('self'),
    peerFacade = makeFacade('peer');
  return facade;
}

export async function runSharedScenario(id, check, { shotPath, launchOptions, timeout } = {}) {
  assert.ok(Object.hasOwn(requiredCases, id));
  const runId = process.env.SPEED_DIAL_TEST_RUN_ID ?? crypto.randomUUID();
  for (const browser of selectedBrowsers()) {
    const driver = await openExtension(browser, await launchOptions?.(browser)),
      cases = [];
    let artifactCount = 0;
    if (timeout !== undefined) assert.ok(Number.isSafeInteger(timeout) && timeout > 0);
    const watchdog =
      timeout === undefined
        ? undefined
        : setTimeout(() => {
            console.error(`${id} ${browser} exceeded ${timeout}ms`);
            void driver.close().catch(() => {});
          }, timeout);
    const exec = (body, ...args) =>
      driver.evaluate(
        new Function('args', 'return (async function(){' + body + '}).apply(null,args)'),
        args,
      );
    const shot = async (
      label,
      { selector, clip, peer, waitForAnimations = true, targetDriver = driver } = {},
    ) => {
      assert.equal(targetDriver.browser, browser, 'Screenshot must use the scenario platform');
      if (waitForAnimations)
        await targetDriver.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => {})),
          );
        });
      const path = resolve(
        shotPath
          ? shotPath(label, browser)
          : resolve('.browser-test', id, browser + '-' + label + '.png'),
      );
      assert.ok(
        path.startsWith(resolve('.browser-test') + sep) && path.endsWith('.png'),
        'Screenshot must stay inside the test artifact directory',
      );
      await rm(path, { force: true });
      await targetDriver.screenshot(path, { selector, clip, peer });
      const png = await readFile(path);
      assert.ok(
        png.length > 24 &&
          png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
          png.readUInt32BE(16) > 0 &&
          png.readUInt32BE(20) > 0,
        'Screenshot must produce a fresh PNG',
      );
      artifactCount++;
      return png;
    };
    const caseDone = (label) => {
      assert.ok(requiredCases[id].includes(label), label);
      assert.ok(!cases.includes(label), 'Duplicate case: ' + label);
      cases.push(label);
    };
    try {
      await driver.media();
      await check(browser, {
        ...driver,
        exec,
        until: (body, timeout = 15000) => expect.poll(() => exec(body), { timeout }).toBeTruthy(),
        pointer: driver.click,
        shot,
        screenshot: shot,
        caseDone,
      });
      assert.equal(artifactCount, requiredArtifacts[id] ?? 0);
      const report = {
        id,
        browser,
        runId,
        status: 'passed',
        cases,
        ...(Object.hasOwn(requiredArtifacts, id) ? { artifactCount } : {}),
      };
      validateScenarioReport(report, { id, browser, runId });
      await mkdir('.browser-test/parity-reports', { recursive: true });
      await writeFile(scenarioReportPath(id, browser), JSON.stringify(report, null, 2));
    } catch (error) {
      await mkdir('.browser-test/parity-reports', { recursive: true });
      await writeFile(
        scenarioReportPath(id, browser),
        JSON.stringify({ id, browser, runId, status: 'failed', cases }, null, 2),
      );
      throw error;
    } finally {
      clearTimeout(watchdog);
      await driver.close();
    }
  }
}
