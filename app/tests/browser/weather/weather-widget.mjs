import { runSharedScenario } from '../helpers/extension-driver.mjs';
import assert from 'node:assert/strict';

import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

import {
  openData,
  dataClick,
  captureBackup,
  chooseBackup,
} from '../helpers/data-management-helpers.mjs';
const out = resolve('.browser-test/weather-widget');
await mkdir(out, { recursive: true });
const cities = [
  'Волгоград',
  'Воронеж',
  'Екатеринбург',
  'Казань',
  'Краснодар',
  'Красноярск',
  'Москва',
  'Нижний Новгород',
  'Новосибирск',
  'Омск',
  'Пермь',
  'Ростов-на-Дону',
  'Самара',
  'Санкт-Петербург',
  'Уфа',
  'Челябинск',
];
async function check(name, { exec, until, key, resize, reload, shot, offline, caseDone, media }) {
  await until(
    'return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;',
  );
  assert.equal(
    await exec('return !!document.querySelector(".weather-widget");'),
    false,
    'off by default',
  );
  const instrument = () =>
    exec(
      'window.api=globalThis.browser??chrome;window.weatherErrors=[];window.weatherRequests=[];addEventListener("error",e=>weatherErrors.push(e.message));window.realFetch=fetch;window.fetch=(url,options)=>{if(/yandex\\.ru\\/pogoda|gismeteo\\.ru/.test(String(url))){weatherRequests.push(String(url));throw Error("Unexpected weather fetch");}if(String(url).startsWith("https://portal.mail.ru/"))return Promise.resolve(new Response(JSON.stringify({data:{mail_cnt:5}})));return realFetch(url,options);};',
    );
  await instrument();
  const change = (selector, value) =>
    exec(
      'const e=document.querySelector(arguments[0]);e.value=arguments[1];e.dispatchEvent(new Event("change",{bubbles:true}));',
      selector,
      value,
    );
  const open = async () => {
    await exec('document.querySelector(".settings-trigger").click();');
    await until('return !!document.querySelector(".weather-settings");');
  };
  const close = async () => {
    await key('Escape');
    await until('return !document.querySelector("dialog");');
  };
  const bookmarksBefore = await exec('return JSON.stringify(await api.bookmarks.getTree());');
  await open();
  await exec(
    '[...document.querySelectorAll(".switch-control")].find(e=>e.textContent.trim()==="Показывать виджет погоды").querySelector("input").click();',
  );
  await until('return !!document.querySelector("#weather-city");');
  assert.deepEqual(
    await exec(
      'return [...document.querySelector("#weather-city").options].map(e=>e.textContent);',
    ),
    cities,
  );
  assert.equal(await exec('return document.querySelector("#weather-city").value;'), 'moscow');
  assert.equal(await exec('return document.querySelector("#weather-provider").value;'), 'yandex');
  await close();
  assert.equal(
    await exec('return document.querySelector(".weather-widget").href;'),
    'https://yandex.ru/pogoda/ru/moscow',
  );
  await open();
  await change('#weather-city', 'nizhny-novgorod');
  await close();
  await until(
    'return document.querySelector(".weather-widget").href==="https://yandex.ru/pogoda/ru/nizhny-novgorod";',
  );
  await exec(
    'window.forecastClick=null;document.addEventListener("click",e=>{const a=e.target.closest(".weather-widget[href]");if(a){window.forecastClick=a.href;e.preventDefault();}},true);document.querySelector(".weather-widget").focus();',
  );
  await key('Enter');
  await until('return window.forecastClick!==null;');
  assert.equal(
    await exec('return window.forecastClick;'),
    'https://yandex.ru/pogoda/ru/nizhny-novgorod',
  );
  await exec(
    'window.weatherSecondTab=(await api.tabs.create({url:location.href,active:false})).id;',
  );
  await until(
    'window.weatherOther=api.extension.getViews({type:"tab"}).find(view=>view!==window&&view.document.querySelector(".weather-widget"));return !!weatherOther;',
  );
  assert.equal(
    await exec('return weatherOther.document.querySelector(".weather-city").textContent;'),
    'Нижний Новгород',
  );
  await exec('weatherOther.document.querySelector(".settings-trigger").click();');
  await until('return !!weatherOther.document.querySelector("#weather-provider");');
  await exec(
    'const e=weatherOther.document.querySelector("#weather-provider");e.value="gismeteo";e.dispatchEvent(new weatherOther.Event("change",{bubbles:true}));',
  );
  await until(
    'return document.querySelector(".weather-widget").href==="https://www.gismeteo.ru/weather-nizhny-novgorod-4355/";',
  );
  await exec('await api.tabs.remove(weatherSecondTab);');
  await open();
  await exec(
    '[...document.querySelectorAll(".switch-control")].find(e=>e.textContent.trim()==="Показывать виджет погоды").querySelector("input").click();',
  );
  await close();
  assert.equal(await exec('return !!document.querySelector(".weather-widget");'), false);
  await open();
  await exec(
    '[...document.querySelectorAll(".switch-control")].find(e=>e.textContent.trim()==="Показывать виджет погоды").querySelector("input").click();',
  );
  await until('return !!document.querySelector("#weather-city");');
  assert.equal(
    await exec('return document.querySelector("#weather-city").value;'),
    'nizhny-novgorod',
  );
  await close();
  assert.deepEqual(await exec('return weatherErrors;'), []);
  assert.deepEqual(await exec('return weatherRequests;'), []);
  await reload();
  await until(
    'return document.querySelector(".weather-widget")?.href==="https://www.gismeteo.ru/weather-nizhny-novgorod-4355/";',
  );
  await instrument();
  await exec(
    'const {settings}=await api.storage.local.get("settings");await api.storage.local.set({settings:{value:{...settings.value,mailruEnabled:true}}});',
  );
  await until('return !!document.querySelector(".mail");');
  for (const theme of ['light', 'dark'])
    for (const width of [320, 360, 768, 1024, 1279, 1280, 1920]) {
      await resize(width, 800);
      await exec(
        'const {settings}=await api.storage.local.get("settings");await api.storage.local.set({settings:{value:{...settings.value,theme:arguments[0]}}});',
        theme,
      );
      await until('return document.documentElement.dataset.theme===' + JSON.stringify(theme) + ';');
      const boxes = await exec(
        'const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return {search:rect(".search"),weather:rect(".weather-widget"),mail:rect(".mail"),gear:rect(".settings-trigger"),width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};',
      );
      assert.equal(boxes.overflow, false, 'no horizontal overflow at ' + width);
      for (const a of ['weather', 'mail', 'gear']) {
        assert.ok(
          boxes[a].left >= 0 && boxes[a].right <= boxes.width + 1,
          a + ' within viewport at ' + width,
        );
        for (const b of ['search', ...['weather', 'mail', 'gear'].filter((k) => k !== a)])
          assert.ok(
            Math.min(boxes[a].right, boxes[b].right) - Math.max(boxes[a].left, boxes[b].left) <=
              1 ||
              Math.min(boxes[a].bottom, boxes[b].bottom) - Math.max(boxes[a].top, boxes[b].top) <=
                1,
            a + ' overlaps ' + b + ' at ' + width,
          );
      }
      await exec('await new Promise(resolve=>setTimeout(resolve,250));');
      await shot(name + '-' + theme + '-' + width);
    }
  await resize(360, 800);
  await openData(exec, until);
  const backup = await captureBackup(exec, until);
  assert.deepEqual(
    [backup.settings.weatherEnabled, backup.settings.weatherCity, backup.settings.weatherProvider],
    [true, 'nizhny-novgorod', 'gismeteo'],
  );
  await exec(
    'const {settings}=await api.storage.local.get("settings");await api.storage.local.set({settings:{value:{...settings.value,weatherCity:"moscow",weatherProvider:"yandex"}}});',
  );
  await chooseBackup(exec, {
    version: 3,
    bookmarks: false,
    entries: [],
    settings: backup.settings,
  });
  await until('return !!document.querySelector(".import-summary");');
  assert.equal(await exec('return !!document.querySelector("#import-destination");'), false);
  await dataClick(exec, 'Импортировать');
  await until(
    'return document.querySelector(".data-result")?.textContent.includes("Настройки применены");',
  );
  await dataClick(exec, 'Готово');
  await until('return !document.querySelector("dialog");');
  assert.equal(
    await exec('return document.querySelector(".weather-widget").href;'),
    'https://www.gismeteo.ru/weather-nizhny-novgorod-4355/',
  );
  assert.equal(
    await exec('return JSON.stringify(await api.bookmarks.getTree());'),
    bookmarksBefore,
    'weather never mutates bookmarks',
  );
  {
    await offline(true);
    assert.equal(
      await exec('return document.querySelector(".weather-widget").href;'),
      'https://www.gismeteo.ru/weather-nizhny-novgorod-4355/',
    );
    await offline(false);
    caseDone('offline-forecast-link');
  }
  assert.deepEqual(await exec('return weatherErrors;'), []);
  assert.deepEqual(await exec('return weatherRequests;'), []);
  caseDone('weather-behavior');
  await media({ forcedColors: 'active', reducedMotion: 'reduce' });
  await key('Tab');
  assert.equal(await exec('return document.querySelectorAll(".weather-widget").length;'), 1);
  await exec('document.querySelector(".weather-widget").focus();');
  assert.notEqual(
    await exec('return getComputedStyle(document.querySelector(".weather-widget")).outlineStyle;'),
    'none',
  );
  assert.equal(
    await exec(
      'return getComputedStyle(document.querySelector(".weather-widget")).transitionDuration;',
    ),
    '0s',
  );
  await shot(name + '-forced-colors');
  caseDone('weather-accessibility');
  console.log(
    'PASS ' +
      name +
      ': weather off by default, 16 cities, Moscow/Yandex defaults, both forecast links/native Enter, real second tab changes, hide/show/reload, JSON import/export, unchanged bookmarks, no weather requests, light/dark and 320/360/768/1024/1279/1280/1920',
  );
}

await runSharedScenario('weather-widget', check, {
  shotPath: (label) => resolve(out, label + '.png'),
});
