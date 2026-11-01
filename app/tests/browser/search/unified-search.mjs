import { runSharedScenario } from '../helpers/extension-driver.mjs';
import { openData, captureBackup } from '../helpers/data-management-helpers.mjs';
import assert from 'node:assert/strict';

async function check(name, { exec, until, key, resize, reload }) {
  await until(
    'return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;',
  );
  await exec(`window.api=globalThis.browser??globalThis.chrome;window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
 const {rootFolderId}=await api.storage.local.get('rootFolderId');window.parityRoot=(await api.bookmarks.create({parentId:rootFolderId,title:'Unified search'})).id;
 window.direct=(await api.bookmarks.create({parentId:parityRoot,title:'Needle root',url:'https://root.example/'})).id;
 window.folder=(await api.bookmarks.create({parentId:parityRoot,title:'Work'})).id;
 window.child=(await api.bookmarks.create({parentId:folder,title:'Work item',url:'https://work.example/needle'})).id;
 const deep=await api.bookmarks.create({parentId:folder,title:'Hidden'});await api.bookmarks.create({parentId:deep.id,title:'Needle hidden',url:'https://hidden.example/'});
 await api.storage.local.set({rootFolderId:parityRoot});
 window.calls=[];window.realFetch=window.fetch;
 window.fetch=(url,init)=>{if(/suggestqueries.google.com|suggest.yandex.ru/.test(String(url))){calls.push(String(url));if(String(url).includes('needle'))return new Promise(resolve=>{window.releaseRemote=()=>resolve(new Response(JSON.stringify(['needle',['Stale remote result']]),{headers:{'content-type':'application/json'}}));});return Promise.resolve(new Response(JSON.stringify(['q',[]]),{headers:{'content-type':'application/json'}}));}return realFetch(url,init);};`);
  await until(
    'return document.querySelector(".folder-root")?.textContent.trim()==="Unified search"&&document.querySelectorAll(".bookmark").length===1;',
  );
  const choose = (id) =>
    exec(
      'const e=document.querySelector(".search select");e.value=arguments[0];e.dispatchEvent(new Event("change",{bubbles:true}));',
      id,
    );
  const type = (value) =>
    exec(
      'const e=document.querySelector(".search input");e.value=arguments[0];e.dispatchEvent(new Event("input",{bubbles:true}));',
      value,
    );
  const toggle = async () => {
    await exec('document.querySelector(".settings-trigger").click();');
    await until('return !!document.querySelector(".settings");');
    await exec(
      'const e=[...document.querySelectorAll(".switch-control")].find(e=>e.textContent.trim()==="Поиск по закладкам").querySelector("input");e.click();',
    );
    await key('Escape');
    await until('return !document.querySelector("dialog");');
  };
  assert.equal(await exec('return document.querySelectorAll(".search input").length;'), 1);
  await exec(
    'window.originalSettingsSet=api.storage.local.set;api.storage.local.set=async values=>{if(values.settings?.value?.searchProvider==="bookmarks")await new Promise((resolve,reject)=>{window.rejectSave=()=>reject(new Error("Controlled settings failure"));});else return originalSettingsSet.call(api.storage.local,values);};',
  );
  await choose('bookmarks');
  await until('return typeof rejectSave==="function";');
  await type('private failed query');
  await exec('rejectSave();');
  await until(
    'return document.querySelector(".search select").value==="yandex"&&document.querySelector(".search input").value==="";',
  );
  await exec('await new Promise(r=>setTimeout(r,350));api.storage.local.set=originalSettingsSet;');
  assert.equal(
    await exec('return calls.length;'),
    0,
    'a failed mode save must not send the local query to the previous web provider',
  );
  await choose('google');
  await type('needle');
  await until('return calls.length===1;');
  await choose('bookmarks');
  await until(
    'return document.querySelector(".search input").getAttribute("role")==="searchbox"&&document.querySelectorAll(".bookmark").length===2;',
  );
  assert.equal(await exec('return document.querySelector(".search input").value;'), 'needle');
  await exec('releaseRemote();await new Promise(r=>setTimeout(r,350));');
  assert.equal(await exec('return calls.length;'), 1);
  assert.equal(
    await exec('return document.querySelectorAll(".suggestions,.search [role=status]").length;'),
    0,
  );
  assert.equal(
    await exec('return [...document.querySelectorAll(".bookmark")].every(e=>!e.draggable);'),
    true,
  );
  for (const width of [360, 1280, 1920]) {
    await resize(width, 800);
    assert.equal(
      await exec(
        'return document.documentElement.scrollWidth<=innerWidth&&getComputedStyle(document.querySelector(".folder-tabs")).visibility==="visible";',
      ),
      true,
    );
  }
  await exec('document.querySelector(".search input").focus();');
  await key('Enter');
  assert.equal(await exec('return document.activeElement.matches(".bookmark");'), true);
  await key('Escape');
  await until('return document.querySelector(".search input").value==="";');
  await type('private local query');
  await toggle();
  await until(
    'return document.querySelector(".search select").value==="yandex"&&!document.querySelector(".search option[value=bookmarks]")&&document.querySelector(".search input").value==="";',
  );
  await exec('await new Promise(r=>setTimeout(r,350));');
  assert.equal(
    await exec('return calls.length;'),
    1,
    'disabling must not send the private local query to a web provider',
  );
  await exec('document.querySelector(".folder-root").focus();');
  await key('/');
  assert.equal(await exec('return document.querySelector(".search select").value;'), 'yandex');
  await toggle();
  await until('return !!document.querySelector(".search option[value=bookmarks]");');
  await exec('document.querySelector(".folder-root").focus();');
  await key('/');
  await until(
    'return document.activeElement===document.querySelector(".search input")&&document.querySelector(".search select").value==="bookmarks";',
  );
  await type('needle');
  await until('return document.querySelectorAll(".bookmark").length===2;');
  await exec('document.querySelector(".folder-tab").click();');
  await until(
    'return document.querySelector(".search input").value===""&&document.querySelectorAll(".bookmark").length===1&&document.querySelector(".bookmark").dataset.bookmarkId===child;',
  );
  await until(
    'return (await api.storage.local.get("settings")).settings.value.searchProvider==="bookmarks";',
  );
  assert.deepEqual(await exec('return errors;'), []);
  await reload();
  await until(
    'return document.querySelector(".search select")?.value==="bookmarks"&&!document.querySelector(".search input").disabled;',
  );
  assert.equal(await exec('return document.querySelector(".search input").value;'), '');
  await exec('document.querySelector(".settings-trigger").click();');
  await until('return !!document.querySelector(".settings");');
  await openData(exec, until);
  assert.equal((await captureBackup(exec, until)).settings.searchProvider, 'bookmarks');
  console.log(
    'PASS ' +
      name +
      ': unified bookmark mode, stale remote cancellation, no network for local queries, setting/fallback/slash, folder selection, persistence/export and 360/1280/1920',
  );
}
await runSharedScenario('unified-search', async (browser, driver) => {
  await check(browser, { ...driver, system: (value) => driver.media({ colorScheme: value }) });
  assert.deepEqual(await driver.errors(), []);
  driver.caseDone('shared-behavior');
});
