import assert from 'node:assert/strict';
import { runSharedScenario, startupFixture } from '../../browser/helpers/extension-driver.mjs';
import { uiAssertions } from '../../browser/helpers/ui-assertions.mjs';

await runSharedScenario(
  'toolbar-styles',
  async (browser, driver) => {
    const {
      evaluate,
      poll,
      releaseApp,
      reload,
      resize,
      click,
      fill,
      key,
      movePointer,
      pointerButton,
      mockFetch,
      media,
      errors,
      shot,
      caseDone,
    } = driver;
    const ui = uiAssertions(driver),
      gear = 'button[aria-label="Настройки"]',
      mail = '[data-provider=mailru] .mail',
      local = '.search select',
      field = '.search input',
      folders = '.folder-tabs',
      scroll = '.folder-scroll';
    const disabled = (selector, value) =>
      poll(() => ui.node(selector, (e) => e.matches(':disabled'))).toBe(value);
    const mailFixture = (count, error = false) =>
      mockFetch('portal.mail.ru', {
        status: error ? 503 : 200,
        body: JSON.stringify({ status: 'ok', data: { mail_cnt: count } }),
      });
    await mailFixture(3);
    await releaseApp();
    await disabled(gear, false);
    await evaluate(async () => {
      const api = globalThis.browser ?? chrome,
        { rootFolderId } = await api.storage.local.get('rootFolderId');
      for (let i = 0; i < 30; i++)
        await api.bookmarks.create({
          parentId: rootFolderId,
          title: 'Папка с длинным названием ' + i,
        });
      await api.bookmarks.create({
        parentId: rootFolderId,
        title: 'Toolbar fixture',
        url: 'https://toolbar.example/',
      });
      const { settings } = await api.storage.local.get('settings');
      await api.storage.local.set({
        settings: { value: { ...settings?.value, mailruEnabled: true, addButton: true } },
      });
    });
    await reload();
    await mailFixture(3);
    await releaseApp();
    await ui.text(mail + ' .badge', '3');
    const refreshMail = async () => {
      await evaluate(async () => {
        const api = globalThis.browser ?? chrome,
          { settings } = await api.storage.local.get('settings');
        await api.storage.local.set({
          settings: { value: { ...settings.value, mailruEnabled: false } },
        });
      });
      await ui.count(mail, 0);
      await evaluate(async () => {
        const api = globalThis.browser ?? chrome,
          { settings } = await api.storage.local.get('settings');
        await api.storage.local.set({
          settings: { value: { ...settings.value, mailruEnabled: true } },
        });
      });
    };
    await evaluate(() => {
      const style = document.createElement('style');
      style.textContent =
        '.page-background {opacity:1!important;background:var(--toolbar-background,#fff)!important}';
      document.head.append(style);
    });
    for (const width of [320, 360, 768, 1024, 1280, 1920]) {
      await resize(width, 700);
      for (const control of [gear, mail]) {
        for (const [property, value] of [
          ['width', '48px'],
          ['height', '48px'],
          ['border-radius', '24px'],
          ['border-top-width', '1px'],
          ['backdrop-filter', 'blur(12px)'],
          ['box-shadow', 'none'],
        ])
          await ui.css(control, property, value);
        await ui.css(ui.nth(control + ' svg', 0), 'width', '20px');
      }
      for (const scrollbar of ['none', 'auto']) {
        await evaluate((scrollbar) => {
          const style = document.createElement('style');
          style.id = 'toolbar-scrollbar-fixture';
          style.textContent =
            '.folder-scroll {scrollbar-width:' +
            scrollbar +
            '!important}.folder-scroll::-webkit-scrollbar {height:16px}';
          document.head.append(style);
        }, scrollbar);
        assert.equal((await ui.rect('.folder-root')).height, 48);
        await evaluate(() => document.querySelector('#toolbar-scrollbar-fixture').remove());
      }
      await ui.css('.folder-root', 'border-radius', '24px');
      await ui.css('.folder-root', 'box-shadow', 'none');
      for (const [name, background] of [
        ['light', '#fff'],
        ['dark', '#000'],
        ['pattern', 'repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0/32px 32px'],
      ]) {
        await ui.node(
          '.page',
          (e, b) => e.style.setProperty('--toolbar-background', b),
          background,
        );
        for (const control of [gear, mail, ui.nth('.folder-tab', 0)]) {
          await ui.hover(control);
          await ui.css(control, 'background-color', 'rgba(255, 255, 255, 0.65)');
          await pointerButton(true);
          await ui.css(control, 'background-color', 'rgba(255, 255, 255, 0.55)');
          if (control === mail) await ui.css(mail, 'color', 'rgb(23, 33, 47)');
          await movePointer(1, 1);
          await pointerButton(false);
        }
        await shot(`${width}-${name}`);
      }
      await ui.select(local, 'bookmarks');
      await ui.focus(field);
      await ui.attribute(field, 'role', 'searchbox');
      await ui.focused(field);
      await ui.visible(folders);
      assert.notEqual(await ui.node(folders, (e) => e.getAttribute('inert')), '');
      await fill(field, 'Toolbar');
      await ui.count('.bookmark', 1);
      await key('Escape');
      await ui.value(field, '');
      await ui.visible(folders);
      await ui.focused(field);
      await click(gear);
      await ui.visible('.settings');
      await click('button[aria-label="Закрыть настройки"]');
      await ui.count('.settings', 0);
      assert.equal(await evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      caseDone('controls-' + width);
    }
    await evaluate(() => {
      const api = globalThis.browser ?? chrome,
        connect = api.runtime.connect;
      api.runtime.connect = (options) => {
        if (options?.name !== 'speed-dial-capture') return connect.call(api.runtime, options);
        let listener;
        return {
          onMessage: { addListener: (f) => (listener = f), removeListener: () => {} },
          onDisconnect: { addListener: () => {}, removeListener: () => {} },
          disconnect: () => {},
          postMessage: (request) => {
            window.finishToolbarCapture = () =>
              listener({ requestId: request.requestId, error: 'Audit controlled capture failure' });
          },
        };
      };
    });
    await ui.attribute('.add-card', 'aria-label', 'Новая закладка');
    await click('.add-card');
    await ui.text('label[for=bookmark-url]', 'Адрес сайта');
    await fill('#bookmark-url', 'https://busy.example/');
    await click('.bookmark-form button[type=submit]');
    await disabled(gear, true);
    await disabled(local, true);
    await disabled('.folder-root', true);
    await ui.css(gear, 'background-color', 'rgb(226, 232, 240)');
    await ui.css(gear, 'cursor', 'not-allowed');
    await ui.css(gear, 'box-shadow', 'none');
    await disabled(field, true);
    await evaluate(() => window.finishToolbarCapture());
    await disabled(gear, false);
    await ui.count('dialog', 0);
    caseDone('pending-capture');
    for (const count of [0, 120]) {
      await mailFixture(count);
      await refreshMail();
      await ui.visible(mail);
      if (count) await ui.text(mail + ' .badge', '99+');
      else await ui.count(mail + ' .badge', 0);
    }
    caseDone('mail-counts');
    await mailFixture(120, true);
    await refreshMail();
    await ui.count('.mail-error', 1);
    await resize(320, 400);
    await ui.hover(mail);
    const error = '.mail-error';
    await ui.visible(error);
    for (const [property, value] of [
      ['font-size', '14px'],
      ['color', 'rgb(74, 8, 8)'],
      ['border-radius', '10px'],
      ['backdrop-filter', 'blur(12px) saturate(1.6)'],
      ['opacity', '1'],
    ])
      await ui.css(error, property, value);
    const e = await ui.rect(error),
      m = await ui.rect(mail);
    assert(e.y >= m.y + m.height + 8);
    assert(e.x >= 16 && e.x + e.width <= 304);
    await shot('mail-error');
    await movePointer(1, 1);
    await ui.css(error, 'opacity', '0');
    await key('Tab');
    await ui.focus(mail);
    await ui.visible(error);
    await ui.css(mail, 'outline-width', '2px');
    caseDone('mail-error-focus');
    await media({ forcedColors: 'active', reducedMotion: 'reduce' });
    await ui.css(scroll, 'mask-image', 'none');
    await ui.css(ui.nth('.folder-tab', 0), 'mask-image', 'none');
    await ui.css(ui.nth('.folder-tab', 0), 'transition-duration', '0s');
    await ui.focus(gear);
    await ui.css(gear, 'outline-width', '2px');
    await media({ transparency: 'reduce' });
    await movePointer(1, 1);
    for (const surface of [gear, mail]) {
      await ui.css(surface, 'background-color', 'rgb(255, 255, 255)');
      await ui.css(surface, 'backdrop-filter', 'none');
    }
    assert.deepEqual(await errors(), []);
    caseDone('accessibility-media');
    console.log(
      'PASS ' +
        browser +
        ' toolbar audit: six widths, three backgrounds, native hover/pressed, search/folders/focus, mail counts/errors and accessibility media',
    );
  },
  { launchOptions: async (browser) => ({ extension: await startupFixture(browser), gated: true }) },
);
