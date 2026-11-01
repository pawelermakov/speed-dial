import assert from 'node:assert/strict';
import { runSharedScenario } from '../helpers/extension-driver.mjs';
import { uiAssertions } from '../helpers/ui-assertions.mjs';

const createRoot = async () => {
  const { rootFolderId } = await (globalThis.browser ?? chrome).storage.local.get('rootFolderId');
  const root = await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: rootFolderId,
    title: 'Работа',
  });
  await (globalThis.browser ?? chrome).storage.local.set({ rootFolderId: root.id });
  return { root: root.id };
};

const readChildren = (id) => (globalThis.browser ?? chrome).bookmarks.getChildren(id);

const createFixture = async (root) => {
  const a = await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: root,
    title: 'First',
    url: 'https://first.example/',
  });
  const folder = await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: root,
    title: 'Работа',
  });
  const b = await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: root,
    title: 'Second',
    url: 'https://second.example/',
  });
  const c = await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: root,
    title: 'Third',
    url: 'https://third.example/',
  });
  const f2 = await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: root,
    title: 'Главная',
  });
  const deep = await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: folder.id,
    title: 'Hidden folder',
  });
  await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: deep.id,
    title: 'Hidden',
    url: 'https://hidden.example/',
  });
  return { a: a.id, b: b.id, c: c.id, folder: folder.id, f2: f2.id, deep: deep.id };
};

const denySecondMove = () => {
  const move = (globalThis.browser ?? chrome).bookmarks.move;
  let count = 0;
  window.restoreMove = () => ((globalThis.browser ?? chrome).bookmarks.move = move);
  (globalThis.browser ?? chrome).bookmarks.move = (...args) => {
    if (++count === 2) return Promise.reject(Error('folders partial move fixture'));
    return move(...args);
  };
};

const beginPendingDrag = (el) => {
  window.dragTarget = el;
  window.testTransfer = new DataTransfer();
  el.dispatchEvent(
    new DragEvent('dragstart', { bubbles: true, dataTransfer: window.testTransfer }),
  );
};

const externalUpdate = (id) =>
  (globalThis.browser ?? chrome).bookmarks.update(id, { title: 'External update during drag' });

const staleDrop = (el) =>
  el.dispatchEvent(
    new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: window.testTransfer,
    }),
  );

const selfDrop = (el) => {
  const dt = new DataTransfer();
  el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  el.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
};

const createDescendant = async (parent) => {
  const folder = await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: parent,
    title: 'Deep',
  });
  return (
    await (globalThis.browser ?? chrome).bookmarks.create({
      parentId: folder.id,
      title: 'Nested',
      url: 'https://nested.example/',
    })
  ).id;
};

const bookmarkExists = async (id) => {
  try {
    await (globalThis.browser ?? chrome).bookmarks.get(id);
    return true;
  } catch {
    return false;
  }
};

const renameRoot = (id) =>
  (globalThis.browser ?? chrome).bookmarks.update(id, {
    title: 'Очень длинное название выбранной папки для проверки расположения',
  });

const createOverflow = async (root) => {
  for (let i = 0; i < 24; i++)
    await (globalThis.browser ?? chrome).bookmarks.create({ parentId: root, title: 'Папка ' + i });
};

const readTokens = (el) => {
  const s = getComputedStyle(el);
  return { accent: s.getPropertyValue('--ui-accent').trim(), background: s.backgroundColor };
};
await runSharedScenario('folder-interaction', async (browser, driver) => {
  const {
      evaluate,
      poll,
      ready,
      reload,
      resize,
      click,
      fill,
      key,
      dragTo,
      errors,
      shot,
      caseDone,
    } = driver,
    ui = uiAssertions(driver);
  await ready();
  await ui.visible('.folder-root');
  await ui.count('[aria-label="Новая папка"]', 0);
  const data = await evaluate(createRoot),
    children = () => evaluate(readChildren, data.root);
  await ui.text('.folder-root', 'Работа');
  await ui.count('.bookmark', 0);
  const fixture = await evaluate(createFixture, data.root);
  const folder = () => ui.byText('button.folder-tab', 'Работа (папка)'),
    main = () => ui.byText('button.folder-tab', 'Главная');
  await ui.visible(await folder());
  await ui.visible(await main());
  await ui.count('.bookmark', 3);
  const contextMenu = async (selector) => {
    await click(selector, { button: 'right' });
    await ui.visible('[role=menu]');
  };
  const plus = async () => {
    await contextMenu('.folder-root');
    await click(await ui.byText('[role=menuitem]', 'Новая папка'));
    await ui.text('label[for=folder-name]', 'Название папки');
  };
  const native = async (source, target, options) => {
    await evaluate(() => {
      window.folderDragTrace = [];
      if (!window.folderDragObserver) {
        window.folderDragObserver = true;
        for (const type of ['dragstart', 'dragend'])
          document.addEventListener(
            type,
            (e) => window.folderDragTrace.push({ type, trusted: e.isTrusted }),
            true,
          );
      }
    });
    await dragTo(source, target, options);
    const events = await evaluate(() => window.folderDragTrace);
    assert.deepEqual(events, [
      { type: 'dragstart', trusted: true },
      { type: 'dragend', trusted: true },
    ]);
  };
  await native('.bookmark:first-of-type', '.bookmark:last-of-type', {
    targetPosition: { x: (await ui.rect(ui.nth('.bookmark', 2))).width - 2, y: 20 },
  });
  await poll(async () => (await children()).filter((r) => r.url).map((r) => r.id)).toEqual([
    fixture.b,
    fixture.c,
    fixture.a,
  ]);
  assert.equal((await children())[1].id, fixture.folder);
  await reload();
  await ui.count('.bookmark', 3);
  await ui.attribute(ui.nth('.bookmark', 0), 'href', 'https://second.example/');
  caseDone('native-reorder');
  await evaluate(denySecondMove);
  await native('.bookmark:first-of-type', '.bookmark:last-of-type', {
    targetPosition: { x: (await ui.rect(ui.nth('.bookmark', 2))).width - 2, y: 20 },
  });
  await ui.containsText('.notice', 'folders partial move fixture');
  const actual = (await children()).filter((r) => r.url).map((r) => r.url);
  await poll(() =>
    evaluate(() => [...document.querySelectorAll('.bookmark')].map((e) => e.href)),
  ).toEqual(actual);
  await evaluate(() => window.restoreMove());
  await click('[aria-label="Закрыть уведомление"]');
  caseDone('partial-native-move');
  await ui.node(ui.nth('.bookmark', 0), beginPendingDrag);
  await evaluate(externalUpdate, fixture.c);
  await ui.count('.bookmark.dragging', 0);
  const external = await children();
  await ui.node(ui.nth('.bookmark', 2), staleDrop);
  assert.deepEqual(await children(), external);
  const before = await children();
  await ui.node(ui.nth('.bookmark', 0), selfDrop);
  await native('.bookmark:first-of-type', await main());
  assert.deepEqual(await children(), before);
  caseDone('drag-guards');
  await plus();
  await fill('#folder-name', 'Cancelled');
  await key('Escape');
  await ui.count('dialog', 0);
  assert.deepEqual(await children(), before);
  await plus();
  await ui.disabled('dialog button[type=submit]');
  await fill('#folder-name', '   ');
  await ui.disabled('dialog button[type=submit]');
  await fill('#folder-name', 'Created');
  await ui.disabled('dialog button[type=submit]', false);
  await fill('#folder-name', '');
  await ui.disabled('dialog button[type=submit]');
  await fill('#folder-name', 'Created');
  await key('Enter');
  const created = await ui.byText('button.folder-tab', 'Created');
  await ui.attribute(created, 'aria-pressed', 'true');
  await ui.count('.bookmark', 0);
  await contextMenu(created);
  await click(await ui.byText('[role=menuitem]', 'Изменить папку'));
  await fill('#folder-name', 'Renamed');
  await key('Enter');
  const renamed = await ui.byText('button.folder-tab', 'Renamed');
  await ui.visible(renamed);
  await native(renamed, await folder(), { targetPosition: { x: 2, y: 24 } });
  await poll(async () => (await children()).filter((r) => !r.url).map((r) => r.title)).toEqual([
    'Renamed',
    'Работа',
    'Главная',
  ]);
  caseDone('folder-crud');
  await contextMenu(renamed);
  await click(await ui.byText('[role=menuitem]', 'Удалить папку'));
  await click(await ui.byText('.confirmation-dialog button', 'Отмена'));
  await ui.count('.confirmation-dialog', 0);
  await ui.visible(renamed);
  const renamedId = (await children()).find((r) => r.title === 'Renamed').id,
    descendant = await evaluate(createDescendant, renamedId);
  await ui.disabled(renamed, false);
  await contextMenu(renamed);
  await click(await ui.byText('[role=menuitem]', 'Удалить папку'));
  await click(await ui.byText('.confirmation-dialog button', 'Удалить'));
  await ui.count('.confirmation-dialog', 0);
  await ui.count(renamed, 0);
  assert.equal(await evaluate(bookmarkExists, descendant), false);
  await contextMenu('.folder-root');
  assert.equal(
    await evaluate(
      () =>
        [...document.querySelectorAll('[role=menuitem]')].filter(
          (e) => e.textContent.trim() === 'Удалить папку',
        ).length,
    ),
    0,
  );
  await key('Escape');
  caseDone('delete-protection');
  await contextMenu(await main());
  await click(await ui.byText('[role=menuitem]', 'Изменить папку'));
  await fill('#folder-name', 'Blur saved');
  await key('Enter');
  await ui.visible(await ui.byText('button.folder-tab', 'Blur saved'));
  await click(await folder());
  await evaluate(async (id) => {
    const api = globalThis.browser ?? chrome,
      tree = await api.bookmarks.getTree();
    const toolbars = tree
      .flatMap((root) => root.children ?? [])
      .filter((node) => node.folderType === 'bookmarks-bar' || node.id === 'toolbar_____');
    if (toolbars.length !== 1) throw Error('Expected one native bookmarks toolbar');
    await api.bookmarks.move(id, { parentId: toolbars[0].id });
  }, fixture.folder);
  await ui.attribute('.folder-root', 'aria-pressed', 'true');
  await evaluate(renameRoot, data.root);
  await ui.attribute(
    '.folder-root',
    'title',
    'Очень длинное название выбранной папки для проверки расположения',
  );
  await evaluate(createOverflow, data.root);
  caseDone('external-move-and-title');
  for (const width of [360, 1280, 1920]) {
    await resize(width, 900);
    await ui.count('button.folder-tab[title="Папка 23"]', 1);
    assert.equal(await ui.node('.folder-scroll', (e) => e.scrollWidth > e.clientWidth), true);
    for (const selector of ['.folder-scroll', '.search']) {
      const r = await ui.rect(selector);
      assert(r && r.x >= 0 && r.x + r.width <= width);
    }
    assert.equal(await ui.node('html', (e) => e.scrollWidth <= innerWidth), true);
    for (const scrollbar of ['none', 'auto']) {
      await evaluate((value) => {
        const style = document.createElement('style');
        style.id = 'folder-scrollbar-fixture';
        style.textContent =
          '.folder-scroll {scrollbar-width:' +
          value +
          '!important}.folder-scroll::-webkit-scrollbar {height:16px}';
        document.head.append(style);
      }, scrollbar);
      assert.equal((await ui.rect('.folder-root')).height, 48);
      await evaluate(() => document.querySelector('#folder-scrollbar-fixture').remove());
    }
    await plus();
    await fill('#folder-name', 'Очень длинное название новой папки');
    const box = await ui.rect('.modal');
    assert(box.x >= 0 && box.x + box.width <= width);
    await ui.visible('dialog button[type=submit]');
    await ui.text('dialog button[type=submit]', 'Создать');
    await click('dialog button[aria-label="Закрыть"]');
    await ui.count('dialog', 0);
    await shot('folders-' + width, { selector: '.bookmark-toolbar' });
    caseDone('layout-' + width);
  }
  const scroll = await ui.node('.folder-scroll', (e) => (e.scrollLeft = 80)),
    top = (await ui.rect('.bookmarks')).y;
  await ui.select('.search select', 'bookmarks');
  await ui.attribute('.search input', 'role', 'searchbox');
  await fill('.search input', 'example');
  await ui.count('.bookmark', 3);
  await ui.attribute(ui.nth('.bookmark', 0), 'draggable', 'false');
  await key('Escape');
  await ui.value('.search input', '');
  await ui.visible('.folder-tabs');
  assert.equal((await ui.rect('.bookmarks')).y, top);
  assert.equal(await ui.node('.folder-scroll', (e) => e.scrollLeft), scroll);
  await ui.node('button[aria-label="Настройки"]', (e) => e.click());
  await click('button[aria-label="Закрыть настройки"]');
  await plus();
  await ui.css('.modal', 'border-top-left-radius', '24px');
  await ui.css('.modal', 'backdrop-filter', 'blur(12px) saturate(1.6)');
  await ui.css('#folder-name', 'border-top-left-radius', '10px');
  const tokens = await ui.node('.modal', readTokens);
  assert.equal(tokens.accent.toUpperCase(), '#FC0');
  assert.equal(tokens.background, 'rgba(255, 255, 255, 0.54)');
  await ui.css('dialog', 'opacity', '1');
  await shot('folder-modal-appearance', { selector: 'dialog' });
  await click('dialog button[aria-label="Закрыть"]');
  caseDone('search-and-appearance');
  // Keep the formerly Firefox-only HTML5 handler path in both browsers as well.
  const html5 = await evaluate(async () => {
    const api = globalThis.browser ?? chrome,
      { rootFolderId } = await api.storage.local.get('rootFolderId');
    window.testRoot = (
      await api.bookmarks.create({ parentId: rootFolderId, title: 'Firefox root' })
    ).id;
    await api.storage.local.set({ rootFolderId: window.testRoot });
    window.testIds = [];
    for (let i = 0; i < 3; i++)
      window.testIds.push(
        (
          await api.bookmarks.create({
            parentId: window.testRoot,
            title: 'Link ' + i,
            url: 'https://ff' + i + '.example/',
          })
        ).id,
      );
    window.testFolder = (
      await api.bookmarks.create({ parentId: window.testRoot, title: 'Folder' })
    ).id;
    return { root: window.testRoot, ids: window.testIds };
  });
  await ui.text('.folder-root', 'Firefox root');
  await ui.count('.bookmark', 3);
  await evaluate(() => {
    const links = document.querySelectorAll('.bookmark'),
      dt = new DataTransfer();
    links[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const r = links[2].getBoundingClientRect();
    links[2].dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientX: r.right - 2,
        dataTransfer: dt,
      }),
    );
    links[2].dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX: r.right - 2,
        dataTransfer: dt,
      }),
    );
    links[0].dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  });
  await poll(async () =>
    (await evaluate(readChildren, html5.root)).filter((e) => e.url).map((e) => e.id),
  ).toEqual([html5.ids[1], html5.ids[2], html5.ids[0]]);
  await evaluate(() =>
    document
      .querySelector('.folder-root')
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
  );
  await click(await ui.byText('[role=menuitem]', 'Новая папка'));
  await fill('#folder-name', 'New folder');
  await ui.node('#folder-name', (e) => e.closest('form').requestSubmit());
  await ui.text('.folder-tab[aria-pressed=true]', 'New folder');
  await evaluate(() => {
    const tabs = document.querySelectorAll('.folder-tab'),
      dt = new DataTransfer();
    tabs[1].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const r = tabs[0].getBoundingClientRect();
    tabs[0].dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientX: r.left + 2,
        dataTransfer: dt,
      }),
    );
    tabs[0].dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX: r.left + 2,
        dataTransfer: dt,
      }),
    );
    tabs[1].dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  });
  await poll(
    async () => (await evaluate(readChildren, html5.root)).filter((e) => !e.url)[0].title,
  ).toBe('New folder');
  await shot('html5-sort');
  assert.deepEqual(await errors(), []);
  caseDone('html5-sort-and-selection');
  console.log(
    'PASS ' +
      browser +
      ' folders: native tile/folder drag, mixed slots, partial failure, guards, CRUD/protection, external events, layouts/search and shared HTML5 paths',
  );
});
