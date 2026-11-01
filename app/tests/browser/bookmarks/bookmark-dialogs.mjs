import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runSharedScenario } from '../helpers/extension-driver.mjs';
import { uiAssertions } from '../helpers/ui-assertions.mjs';
const out = resolve('.browser-test/bookmark-dialogs');
await mkdir(out, { recursive: true });
const icon = await readFile('public/images/icon128.png'),
  png = 'data:image/png;base64,' + icon.toString('base64');
const server = createServer((req, res) => {
  if (req.url === '/favicon.ico') {
    res.setHeader('Content-Type', 'image/png');
    res.end(icon);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end('<title>Actual local page</title><body>Capture fixture</body>');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const site = 'http://127.0.0.1:' + server.address().port;
const createFixture = async () => {
  const root = (await (globalThis.browser ?? chrome).storage.local.get('rootFolderId'))
    .rootFolderId;
  const settings = (await (globalThis.browser ?? chrome).storage.local.get('settings')).settings;
  await (globalThis.browser ?? chrome).storage.local.set({
    settings: { value: { ...settings?.value, addButton: true } },
  });
  const a = await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: root,
    title: 'Work',
  });
  return { root, a: a.id };
};

const mockCapture = (png) => {
  window.captureCalls = [];
  window.captureTitle = 'Captured Page';
  window.captureFail = false;
  const connect = (globalThis.browser ?? chrome).runtime.connect;
  window.restoreNativeCapture = () => {
    (globalThis.browser ?? chrome).runtime.connect = connect;
  };
  (globalThis.browser ?? chrome).runtime.connect = (options) => {
    if (options?.name !== 'speed-dial-capture')
      return connect.call((globalThis.browser ?? chrome).runtime, options);
    let listener;
    return {
      onMessage: { addListener: (f) => (listener = f), removeListener: () => {} },
      onDisconnect: { addListener: () => {}, removeListener: () => {} },
      disconnect: () => {},
      postMessage: (request) => {
        window.captureCalls.push(request.url);
        setTimeout(
          () =>
            listener({
              requestId: request.requestId,
              title: window.captureTitle,
              thumbnail: png,
              favicon: '',
              ...(window.captureFail ? { error: 'Test capture failed' } : {}),
            }),
          100,
        );
      },
    };
  };
};

const readRows = (id) => (globalThis.browser ?? chrome).bookmarks.getChildren(id);

const readTicket = async (id) => {
  const db = await new Promise((r) => {
    const req = indexedDB.open('SpeedDialX');
    req.onsuccess = () => r(req.result);
  });
  const value = await new Promise((r) => {
    const req = db.transaction('autoNames').objectStore('autoNames').get(id);
    req.onsuccess = () => r(req.result);
  });
  db.close();
  return value;
};

const externalRename = async (id) => {
  await (globalThis.browser ?? chrome).bookmarks.update(id, { title: 'External' });
  await (globalThis.browser ?? chrome).bookmarks.update(id, { title: '127.0.0.1' });
};

const denyCreate = () => {
  const original = (globalThis.browser ?? chrome).bookmarks.create;
  window.restoreCreate = () => ((globalThis.browser ?? chrome).bookmarks.create = original);
  (globalThis.browser ?? chrome).bookmarks.create = async () => {
    throw Error('Test API denied');
  };
};
try {
  await runSharedScenario('bookmark-dialogs', async (browser, driver) => {
    const { evaluate, poll, ready, resize, click, clickAt, fill, key, errors, shot, caseDone } =
        driver,
      ui = uiAssertions(driver),
      url = '#bookmark-url',
      title = '#bookmark-title',
      folder = '#bookmark-folder';
    await ready();
    await ui.disabled('.add-card', false);
    const fixture = await evaluate(createFixture);
    const work = await ui.byText('button.folder-tab', 'Work');
    await click(work);
    await evaluate(mockCapture, png);
    const appearance = async () => {
      await ui.visible('dialog');
      await ui.css('dialog', 'opacity', '1');
      await ui.css('.page-background', 'filter', 'none');
      await ui.css('.dial', 'filter', 'none');
      await ui.css('dialog', 'background-color', 'rgba(8, 14, 25, 0.2)');
    };
    const open = async () => {
      await click('.add-card');
      await appearance();
      await ui.text('label[for=bookmark-url]', 'Адрес сайта');
      await ui.text('label[for=bookmark-title]', 'Название');
      await ui.text('label[for=bookmark-folder]', 'Папка');
    };
    const rows = () => evaluate(readRows, fixture.a),
      ticket = (id) => evaluate(readTicket, id),
      calls = () => evaluate(() => window.captureCalls.length);
    const edit = async () => {
      await ui.scroll(ui.nth('.bookmark', (await rows()).length - 1));
      const r = await ui.rect(ui.nth('.bookmark', (await rows()).length - 1));
      await clickAt(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2), {
        button: 'right',
      });
      await click(await ui.byText('[role=menuitem]', 'Изменить закладку'));
      await appearance();
    };
    const submit = async () => {
      await click('dialog button[type=submit]');
      await ui.count('dialog', 0);
      await ui.disabled('.add-card', false);
    };
    await open();
    await ui.value(folder, fixture.a);
    await ui.focused(url);
    await ui.checked('.capture-option input');
    await ui.text('.capture-option label', 'Создать эскиз сайта');
    const help = 'button[aria-label="О создании эскиза"]',
      tip = '#bookmark-capture-info';
    await ui.hover(help);
    await ui.visible(tip);
    await ui.containsText(tip, 'Сайт временно откроется');
    await ui.css(tip, 'opacity', '1');
    const helpBox = await ui.rect(help),
      tipBox = await ui.rect(tip);
    assert.ok(Math.abs(tipBox.x + tipBox.width / 2 - (helpBox.x + helpBox.width / 2)) < 1);
    await shot('capture-tooltip');
    await ui.hover(url);
    await ui.hidden(tip);
    await ui.focus(help);
    await ui.visible(tip);
    await key('Escape');
    await ui.hidden(tip);
    await ui.visible('dialog');
    await ui.focus(url);
    for (const width of [360, 1280, 1920]) {
      await resize(width, 800);
      assert(await ui.node('dialog section', (e) => e.scrollWidth <= e.clientWidth));
      await shot('add-' + width);
    }
    caseDone('defaults-tooltips-layouts');
    await ui.disabled('dialog button[type=submit]');
    await ui.node('.bookmark-form', (form) => form.requestSubmit());
    await fill(url, 'foo');
    await ui.focus(title);
    await ui.count('.bookmark-form [role=alert]', 0);
    await ui.attribute(url, 'aria-invalid', null);
    await fill(url, '   ');
    await ui.disabled('dialog button[type=submit]');
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,bad',
      'https://',
      'foo',
      'https://bad..com',
      'https://-bad.com',
      'https://a b.com',
      '1',
      '12',
      '123',
      '1.2',
      '1.2.3',
      'https://123',
      'example.c',
      'https://a.b',
    ]) {
      await fill(url, value);
      await ui.disabled('dialog button[type=submit]');
    }
    for (const value of [
      'example.com',
      'https://example.com/path',
      'http://localhost:8080/',
      'https://пример.рф/',
      '123.com',
      'a.co',
      'http://127.0.0.1/',
      'http://[::1]/',
    ]) {
      await fill(url, value);
      await ui.disabled('dialog button[type=submit]', false);
    }
    await ui.attribute(title, 'placeholder', null);
    await ui.attribute(url, 'placeholder', null);
    assert.deepEqual(
      await evaluate(() =>
        [
          ...document.querySelectorAll(
            '.bookmark-form .ui-control,.bookmark-form button[type=submit]',
          ),
        ].map((e) => e.getBoundingClientRect().height),
      ),
      [40, 40, 40, 40],
    );
    assert.equal((await rows()).length, 0);
    caseDone('url-validation');
    await fill(url, site + '/first');
    await click('.capture-option input');
    await ui.checked('.capture-option input', false);
    await submit();
    let id = (await rows())[0].id;
    assert.equal((await rows())[0].title, '127.0.0.1');
    assert(await ticket(id));
    assert.equal(await calls(), 0);
    await edit();
    await ui.value(title, '127.0.0.1');
    await fill(url, site + '/second');
    await submit();
    assert.equal((await rows())[0].title, 'Captured Page');
    assert.equal(await ticket(id), undefined);
    assert.equal(await calls(), 1);
    await edit();
    await fill(title, 'My name');
    await submit();
    assert.equal(await calls(), 1);
    await edit();
    await fill(url, site + '/third');
    await submit();
    assert.equal((await rows())[0].title, 'My name');
    assert.equal(await calls(), 2);
    await edit();
    await fill(title, '');
    await submit();
    assert(await ticket(id));
    await evaluate(externalRename, id);
    await poll(() => ticket(id)).toBeFalsy();
    await open();
    await ui.checked('.capture-option input');
    await fill(url, site + '/new');
    await fill(title, 'User title');
    await submit();
    assert.equal((await rows()).length, 2);
    assert.equal((await rows())[1].title, 'User title');
    caseDone('capture-titles-and-edits');
    await edit();
    await fill(url, 'foo');
    await ui.focus(title);
    await ui.disabled('dialog button[type=submit]');
    await ui.count('.bookmark-form [role=alert]', 0);
    await fill(title, 'Unsaved');
    await key('Escape');
    await ui.count('dialog', 0);
    assert.equal((await rows())[1].title, 'User title');
    await open();
    await fill(url, site + '/failure');
    await evaluate(() => {
      window.captureFail = true;
    });
    await submit();
    assert.equal((await rows()).length, 3);
    assert.equal((await rows())[2].title, '127.0.0.1');
    await ui.containsText('[role=status]', 'Закладка сохранена');
    await evaluate(() => {
      window.captureFail = false;
    });
    await open();
    await fill(url, site + '/api');
    await evaluate(denyCreate);
    await click('dialog button[type=submit]');
    await ui.containsText('dialog [role=alert]', 'Test API denied');
    await ui.value(url, site + '/api');
    await evaluate(() => window.restoreCreate());
    await key('Escape');
    await ui.count('dialog', 0);
    caseDone('cancel-and-failures');
    await open();
    await fill(url, site + '/stale');
    const stale = await evaluate(
      async (root) =>
        (
          await (globalThis.browser ?? chrome).bookmarks.create({
            parentId: root,
            title: 'Temporary',
          })
        ).id,
      fixture.root,
    );
    await key('Escape');
    await ui.count('dialog', 0);
    await open();
    await ui.select(folder, stale);
    await fill(url, site + '/stale');
    await evaluate((id) => (globalThis.browser ?? chrome).bookmarks.removeTree(id), stale);
    await click('dialog button[type=submit]');
    await ui.visible('#bookmark-folder-error');
    await key('Escape');
    await ui.count('dialog', 0);
    await edit();
    await ui.select(folder, fixture.root);
    await submit();
    assert.equal((await rows()).length, 2);
    assert.equal((await evaluate(readRows, fixture.root)).filter((r) => r.url).length, 1);
    caseDone('stale-folder-and-move');
    await open();
    await fill(url, site + '/double');
    const before = (await rows()).length;
    await ui.node('.bookmark-form', (form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await ui.count('dialog', 0);
    await ui.disabled('.add-card', false);
    assert.equal((await rows()).length, before + 1);
    assert.equal((await rows()).at(-1).title, 'Captured Page');
    await edit();
    await ui.count('.capture-option input', 0);
    await shot('edit-1920');
    await fill(title, 'Draft');
    await click('dialog .close');
    await ui.count('dialog', 0);
    assert.equal((await rows()).at(-1).title, 'Captured Page');
    await click('button[aria-label="Настройки"]');
    await ui.visible('.settings');
    assert.equal(
      await evaluate(
        () =>
          [...document.querySelectorAll('.settings input')].filter(
            (e) =>
              e.getAttribute('aria-label') === 'Скругление (px)' ||
              [...(e.labels ?? [])].some((label) => label.textContent.trim() === 'Скругление (px)'),
          ).length,
      ),
      0,
    );
    await click('button[aria-label="Закрыть настройки"]');
    await ui.count('.settings', 0);
    await open();
    await ui.css('.bookmark-dialog', 'border-radius', '24px');
    await ui.css('.bookmark-dialog', 'backdrop-filter', 'blur(12px) saturate(1.6)');
    await shot('appearance-settings');
    await click('dialog .close');
    await ui.count('dialog', 0);
    caseDone('double-submit-and-appearance');
    await evaluate(() => window.restoreNativeCapture());
    await open();
    await ui.checked('.capture-option input');
    await fill(url, 'https://firefox.example/');
    await click('.capture-option input');
    await submit();
    const native = (await rows()).at(-1);
    assert.equal(native.title, 'firefox.example');
    await edit();
    await fill(url, site + '/changed');
    await submit();
    await poll(async () => (await rows()).find((row) => row.id === native.id)?.title).toBe(
      'Actual local page',
    );
    await shot('native-capture');
    assert.deepEqual(await errors(), []);
    caseDone('native-browser-capture');
    console.log(
      'PASS ' +
        browser +
        ' full bookmark dialogs: validation, layouts, capture titles, edits, cancellation, failures, stale folders, move, double submit and native browser capture',
    );
  });
} finally {
  await new Promise((resolve) => server.close(resolve));
}
