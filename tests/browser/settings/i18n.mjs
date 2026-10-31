import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { openExtension, selectedBrowsers } from '../helpers/extension-driver.mjs';
import { i18nFixture, validateStartupLanguages } from '../helpers/i18n-helpers.mjs';
import { i18nLocales, scenarioReportPath, validateScenarioReport } from '../../scenarios.mjs';
import { chooseBackup } from '../helpers/data-management-helpers.mjs';
const out = resolve('.browser-test/i18n');
await mkdir(out, { recursive: true });
const labels = {
  ru: {
    settings: 'Настройки',
    manage: 'Управление данными',
    export: 'Экспорт',
    exportAction: 'Экспортировать',
    done: 'Готово',
    cancel: 'Отмена',
    edit: 'Изменить закладку',
    delete: 'Удалить закладку',
    deleteTitle: 'Удалить закладку?',
    city: 'Москва',
    invalid: 'Введите целое число от 50 до 100.',
  },
  en: {
    settings: 'Settings',
    manage: 'Manage data',
    export: 'Export',
    exportAction: 'Export',
    done: 'Done',
    cancel: 'Cancel',
    edit: 'Edit bookmark',
    delete: 'Delete bookmark',
    deleteTitle: 'Delete bookmark?',
    city: 'Moscow',
    invalid: 'Enter a whole number from 50 to 100.',
  },
  es: {
    settings: 'Ajustes',
    manage: 'Gestionar datos',
    export: 'Exportar',
    exportAction: 'Exportar',
    done: 'Listo',
    cancel: 'Cancelar',
    edit: 'Editar marcador',
    delete: 'Eliminar marcador',
    deleteTitle: '¿Eliminar marcador?',
    city: 'Moscú',
    invalid: 'Introduce un número entero entre 50 y 100.',
  },
};
async function check(name, tag, { exec, until, key, reload, resize, shot }) {
  const initial = 'ru';
  await until(
    'return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;',
  );
  await until('return window.startupLanguages?.length>0;');
  validateStartupLanguages(await exec('return window.startupLanguages;'), labels[initial].settings);
  assert.equal(
    await exec('return document.documentElement.lang;'),
    initial,
    'Russian default regardless of browser language',
  );
  assert.equal(
    await exec('return document.querySelector(".settings-trigger").title;'),
    labels[initial].settings,
  );
  await exec(
    'window.api=globalThis.browser??chrome;window.localizedErrors=[];addEventListener("error",event=>localizedErrors.push(event.message));window.userTitle="Настройки <b>Mi sitio</b>";const {rootFolderId}=await api.storage.local.get("rootFolderId");window.userBookmark=await api.bookmarks.create({parentId:rootFolderId,title:userTitle,url:"https://language-test.invalid/"});const {settings}=await api.storage.local.get("settings");await api.storage.local.set({settings:{value:{...settings?.value,weatherEnabled:true,movieSearch:true,addButton:true}}});',
  );
  await until('return !!document.querySelector(".bookmark");');
  const bookmarksBefore = await exec('return JSON.stringify(await api.bookmarks.getTree());');
  let lastBackup;
  const click = (label) =>
    exec(
      'const button=[...document.querySelectorAll("dialog button,[role=menu] button")].find(e=>e.textContent.trim()===arguments[0]||e.getAttribute("aria-label")===arguments[0]);if(!button)throw Error(arguments[0]);button.click();',
      label,
    );
  const openSettings = async () => {
    await exec('document.querySelector(".settings-trigger").click();');
    await until('return !!document.querySelector("#interface-language");');
  };
  const close = async () => {
    await key('Escape');
    await until('return !document.querySelector("dialog");');
  };
  for (const code of ['ru', 'en', 'es']) {
    const text = labels[code];
    await openSettings();
    assert.deepEqual(
      await exec(
        'return [...document.querySelector("#interface-language").options].map(e=>e.textContent);',
      ),
      ['Русский', 'English', 'Español'],
    );
    await exec(
      'const input=document.querySelector(".settings-number");input.value="1";input.dispatchEvent(new Event("input",{bubbles:true}));const select=document.querySelector("#interface-language");select.value=arguments[0];select.dispatchEvent(new Event("change",{bubbles:true}));',
      code,
    );
    await until(
      'return document.documentElement.lang===' +
        JSON.stringify(code) +
        '&&document.querySelector(".settings h2")?.textContent===' +
        JSON.stringify(text.settings) +
        ';',
    );
    await until(
      'return document.querySelector("#settings-width-error")?.textContent===' +
        JSON.stringify(text.invalid) +
        ';',
    );
    assert.equal(
      await exec('return document.querySelector("#weather-city option:checked").textContent;'),
      text.city,
    );
    await until(
      'return document.querySelector(".folder-root").textContent.includes(' +
        JSON.stringify(
          { ru: 'Другие закладки', en: 'Other bookmarks', es: 'Otros marcadores' }[code],
        ) +
        ');',
    );
    await exec(
      'const input=document.querySelector(".settings-number");input.value="100";input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("blur"));',
    );
    for (const width of [360, 1280]) {
      await resize(width, 800);
      await exec('await new Promise(resolve=>setTimeout(resolve,250));');
      assert.equal(
        await exec(
          'return document.querySelector(".settings").scrollWidth>document.querySelector(".settings").clientWidth;',
        ),
        false,
        'settings overflow ' + code + ' ' + width,
      );
      await shot(name + '-' + code + '-' + width);
    }
    if (code !== 'ru') {
      const leftover = await exec(
        'const clone=document.querySelector(".settings").cloneNode(true);clone.querySelector("#interface-language").remove();return clone.textContent.match(/[А-Яа-яЁё]+/g)??[];',
      );
      assert.deepEqual(leftover, [], code + ' settings untranslated text');
    }
    await close();
    assert.equal(
      await exec(
        'return document.querySelector(".bookmark").getAttribute("aria-label").includes(userTitle);',
      ),
      true,
      'user title untouched',
    );
    await exec(
      'document.querySelector(".bookmark").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:100,clientY:250}));',
    );
    await until('return !!document.querySelector("[role=menu]");');
    await click(text.edit);
    await until('return !!document.querySelector(".bookmark-form");');
    assert.equal(
      await exec('return document.querySelector("#bookmark-title").value;'),
      'Настройки <b>Mi sitio</b>',
    );
    assert.equal(await exec('return document.querySelector(".modal h2").textContent;'), text.edit);
    await close();
    await exec(
      'document.querySelector(".bookmark").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:100,clientY:250}));',
    );
    await until('return !!document.querySelector("[role=menu]");');
    await click(text.delete);
    await until('return !!document.querySelector(".confirmation-dialog");');
    assert.equal(
      await exec('return document.querySelector(".confirmation-dialog h2").textContent;'),
      text.deleteTitle,
    );
    assert.equal(
      await exec(
        'return document.querySelector(".confirmation-dialog").textContent.includes(userTitle);',
      ),
      true,
    );
    await close();
    await openSettings();
    await click(text.manage);
    await until('return !!document.querySelector(".data-management");');
    await click(text.export);
    await until('return !!document.querySelector(".export-summary");');
    await exec(
      'window.backupDownload=null;window.nativeAnchorClick??=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.backupDownload=this.href;else window.nativeAnchorClick.call(this);};',
    );
    await click(text.exportAction);
    await until('return !!window.backupDownload&&!!document.querySelector(".data-result");');
    const backup = await exec('return JSON.parse(await (await fetch(backupDownload)).text());');
    lastBackup = backup;
    assert.equal(backup.settings.language, code);
    await click(text.done);
    await until('return !document.querySelector("dialog");');
  }
  await openSettings();
  await click(labels.es.manage);
  await until('return !!document.querySelector(".data-management");');
  await chooseBackup(exec, '{not json');
  await until('return !!document.querySelector(".data-management [role=alert]");');
  assert.equal(
    await exec(
      'return document.querySelector(".data-management [role=alert]").textContent.includes("No se pudo leer el JSON");',
    ),
    true,
  );
  await chooseBackup(exec, {
    version: 3,
    bookmarks: false,
    entries: [],
    settings: { ...lastBackup.settings, language: 'ru' },
  });
  await until('return !!document.querySelector(".import-summary");');
  await click('Importar');
  await until(
    'return !!document.querySelector(".data-result")&&document.documentElement.lang==="ru";',
  );
  await click(labels.ru.done);
  await until('return !document.querySelector("dialog");');
  await openSettings();
  await exec(
    'const select=document.querySelector("#interface-language");select.value="es";select.dispatchEvent(new Event("change",{bubbles:true}));',
  );
  await until('return document.documentElement.lang==="es";');
  await close();
  await reload();
  await until('return !!document.querySelector(".folder-root");');
  assert.equal(
    await exec('return document.documentElement.lang;'),
    'es',
    'reload persists explicit language',
  );
  await until('return window.startupLanguages?.length>0;');
  validateStartupLanguages(await exec('return window.startupLanguages;'), labels.es.settings);
  await exec(
    'window.api=globalThis.browser??chrome;window.peer=await api.tabs.create({url:api.runtime.getURL("newtab.html"),active:false});',
  );
  await until(
    'return api.extension.getViews({type:"tab"}).some(view=>view!==window&&view.document.querySelector(".settings-trigger")?.disabled===false);',
  );
  await exec(
    'window.peerView=api.extension.getViews({type:"tab"}).find(view=>view!==window&&view.document.querySelector(".settings-trigger")?.disabled===false);peerView.document.querySelector(".settings-trigger").click();',
  );
  await until('return !!peerView.document.querySelector("#interface-language");');
  await exec(
    'const select=peerView.document.querySelector("#interface-language");select.value="en";select.dispatchEvent(new peerView.Event("change",{bubbles:true}));',
  );
  await until('return document.documentElement.lang==="en";');
  assert.equal(
    await exec('return JSON.stringify(await api.bookmarks.getTree());'),
    bookmarksBefore,
    'language never edits bookmarks',
  );
  await exec('await api.tabs.remove(peer.id);');
  assert.deepEqual(await exec('return window.localizedErrors??[];'), []);
  for (const code of ['ru', 'en', 'es']) {
    const catalog = JSON.parse(await readFile(resolve('locales', code + '.json'), 'utf8'));
    assert.equal(
      await exec(
        'return (await (await fetch(api.runtime.getURL("_locales/"+arguments[0]+"/messages.json"))).json()).extensionDescription.message;',
        code,
      ),
      catalog['extension.description'],
      'generated browser locale ' + code,
    );
  }
  // Playwright's page-locale emulation does not necessarily change the installed browser UI locale.
  const descriptions = await Promise.all(
    ['ru', 'en', 'es'].map(
      async (code) =>
        JSON.parse(await readFile(resolve('locales', code + '.json'), 'utf8'))[
          'extension.description'
        ],
    ),
  );
  assert.ok(
    descriptions.includes(await exec('return api.runtime.getManifest().description;')),
    'manifest resolves a bundled localized description',
  );

  console.log(
    'PASS ' +
      name +
      ' ' +
      tag +
      ': browser default, RU/EN/ES live switch, preserved user content, translated errors/dialogs/export, persistence, real second tab, narrow layout and manifest locale',
  );
}
const runId = process.env.SPEED_DIAL_TEST_RUN_ID ?? crypto.randomUUID();
for (const browser of selectedBrowsers()) {
  const cases = [];
  const report = (status) => ({ id: 'i18n', browser, runId, status, cases });
  const reportPath = scenarioReportPath('i18n', browser);
  await mkdir(resolve(reportPath, '..'), { recursive: true });
  try {
    const extension = await i18nFixture(browser);
    for (const tag of i18nLocales) {
      const driver = await openExtension(browser, { extension, locale: tag });
      try {
        const exec = (body, ...args) =>
          driver.evaluate(
            new Function('args', 'return (async function(){' + body + '}).apply(null,args)'),
            args,
          );
        await check(browser, tag, {
          exec,
          until: (body) => expect.poll(() => exec(body), { timeout: 15000 }).toBeTruthy(),
          key: (value) => driver.key(value),
          reload: () => driver.reload(),
          resize: (width, height) => driver.resize(width, height),
          shot: (label) => driver.screenshot(resolve(out, tag + '-' + label + '.png')),
        });
        cases.push('locale-' + tag);
      } finally {
        await driver.close();
      }
    }
    validateScenarioReport(report('passed'), { id: 'i18n', browser, runId });
    await writeFile(reportPath, JSON.stringify(report('passed')));
  } catch (error) {
    await writeFile(reportPath, JSON.stringify(report('failed')));
    throw error;
  }
}
