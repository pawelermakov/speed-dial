import { runSharedScenario } from '../helpers/extension-driver.mjs';
import assert from 'node:assert/strict';

async function check(name, { exec, until, key, reload }) {
  await until(
    'return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;',
  );
  const options = () =>
    exec('return [...document.querySelectorAll(".search option")].map(e=>e.value);');
  assert.deepEqual(await options(), ['yandex', 'google', 'bookmarks']);
  const toggle = async () => {
    await exec('document.querySelector(".settings-trigger").click();');
    await until('return !!document.querySelector(".settings");');
    await exec(
      '[...document.querySelectorAll(".switch-control")].find(e=>e.textContent.trim()==="Поиск фильмов и сериалов").querySelector("input").click();',
    );
    await key('Escape');
    await until('return !document.querySelector("dialog");');
  };
  await toggle();
  await until('return document.querySelectorAll(".search option").length===6;');
  await exec(
    'const e=document.querySelector(".search select");e.value="imdb";e.dispatchEvent(new Event("change",{bubbles:true}));',
  );
  await until(
    'return ((await (globalThis.browser??chrome).storage.local.get("settings")).settings?.value.searchProvider)==="imdb";',
  );
  await reload();
  await until(
    'return document.querySelector(".search select")?.value==="imdb"&&!document.querySelector(".settings-trigger").disabled;',
  );
  await toggle();
  await until(
    'return document.querySelector(".search select").value==="yandex"&&document.querySelectorAll(".search option").length===3;',
  );
  assert.equal(
    await exec(
      'return (await (globalThis.browser??chrome).storage.local.get("settings")).settings.value.movieSearch;',
    ),
    false,
  );
  await reload();
  await until('return document.querySelectorAll(".search option").length===3;');
  console.log(
    'PASS ' +
      name +
      ': movie setting defaults, opt-in, selection persistence, disable fallback and reload',
  );
}
await runSharedScenario('movie-search', async (browser, driver) => {
  await check(browser, { ...driver, system: (value) => driver.media({ colorScheme: value }) });
  assert.deepEqual(await driver.errors(), []);
  driver.caseDone('shared-behavior');
});
