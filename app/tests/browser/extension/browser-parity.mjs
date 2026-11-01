import { runSharedScenario } from '../helpers/extension-driver.mjs';
import {
  openData,
  dataClick,
  chooseBackup,
  captureBackup,
} from '../helpers/data-management-helpers.mjs';
import assert from 'node:assert/strict';

// The same assertions run against both production builds, using native bookmark
// APIs. Synthetic drag events test our HTML5 handlers, not OS drag initiation.
async function check(name, driver) {
  const { exec, until, key, resize } = driver;
  const click = (text) =>
    exec(
      'const b=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()===arguments[0]||b.getAttribute("aria-label")===arguments[0]);if(!b)throw Error(arguments[0]);b.click();',
      text,
    );
  const field = (selector, value) =>
    exec(
      'const e=document.querySelector(arguments[0]);e.value=arguments[1];e.dispatchEvent(new Event("input",{bubbles:true}));',
      selector,
      value,
    );
  const close = async () => {
    if (await exec('return !!document.querySelector("[role=tooltip]");')) await key('Escape');
    await key('Escape');
    await until('return !document.querySelector("dialog");');
  };
  await until(
    'return !!document.querySelector(".folder-root") && !document.querySelector(".settings-trigger").disabled;',
  );
  await exec(`window.parityErrors=[];addEventListener('error',e=>parityErrors.push(e.message));addEventListener('unhandledrejection',e=>parityErrors.push(String(e.reason)));
 const api=globalThis.browser??globalThis.chrome;window.api=api;
 const {rootFolderId}=await api.storage.local.get('rootFolderId');
 window.parityRoot=(await api.bookmarks.create({parentId:rootFolderId,title:'Parity source'})).id;
 window.parityIds=[];
 for(let i=0;i<3;i++)parityIds.push((await api.bookmarks.create({parentId:parityRoot,title:'Parity '+i,url:'https://parity'+i+'.example/'})).id);
 window.parityFolder=(await api.bookmarks.create({parentId:parityRoot,title:'Parity folder'})).id;
 await api.bookmarks.create({parentId:parityFolder,title:'Inside folder',url:'https://inside.example/'});
 ${name === 'firefox' ? "window.paritySeparator=(await api.bookmarks.create({parentId:parityRoot,index:1,type:'separator'})).id;" : ''}
 await api.storage.local.set({rootFolderId:parityRoot});`);
  await until(
    'return document.querySelectorAll(".bookmark").length===3 && document.querySelector(".folder-root")?.textContent.trim()==="Parity source";',
  );
  assert.equal(
    await exec('return document.querySelectorAll(".folder-tab").length;'),
    1,
    'separator must not become a folder',
  );
  await click('Настройки');
  await until('return !!document.querySelector("#bookmark-folder");');
  assert.equal(
    await exec(
      'return [...document.querySelector("#bookmark-folder").options].filter(o=>o.value===window.paritySeparator).length;',
    ),
    0,
  );
  assert.equal(
    await exec('return document.querySelector(".settings").closest("dialog").matches(":modal");'),
    true,
  );
  await exec('document.querySelector(".search input").focus();');
  assert.equal(
    await exec('return !!document.activeElement.closest("dialog");'),
    true,
    'modal must isolate background focus',
  );
  await openData(exec, until);
  const exported = await captureBackup(exec, until);
  assert.equal(exported.version, 3);
  assert.equal(exported.entries.length, 4);
  assert.deepEqual(
    exported.entries.map((e) => e.title),
    ['Parity 0', 'Parity 1', 'Parity 2', 'Parity folder'],
  );
  assert.equal(exported.entries[3].children[0].title, 'Inside folder');
  await chooseBackup(exec, '{"version":1}');
  await until('return !!document.querySelector(".data-management [role=alert]");');
  assert.equal(
    await exec(
      'return (await api.bookmarks.getChildren(parityRoot)).filter(e=>e.url&&e.type!=="separator").length;',
    ),
    3,
  );
  await chooseBackup(exec, {
    ...exported,
    entries: [
      {
        title: 'Imported folder',
        children: [{ title: 'Imported link', url: 'https://imported.example/' }],
      },
    ],
  });
  await until('return !!document.querySelector("#import-destination");');
  await dataClick(exec, 'Импортировать');
  await until(
    'return document.querySelector(".data-management [role=status]")?.textContent.includes("Добавлена 1 закладка");',
  );
  await key('Escape');
  await until('return !document.querySelector(".data-management");');
  await close();
  await until(
    'return [...document.querySelectorAll(".folder-tab")].some(e=>e.textContent.trim()==="Imported folder");',
  );
  console.log(
    'PASS ' +
      name +
      ': native source, separator exclusion, modal isolation, export/download Blob, invalid/valid import',
  );

  // Reordering must preserve separators and folder slots in native storage.
  await exec(`const links=document.querySelectorAll('.bookmark'),dt=new DataTransfer();
 links[0].dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}));
 const r=links[2].getBoundingClientRect();links[2].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:r.right-2,clientY:r.top+20}));
 links[0].dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}));`);
  await until(
    'return (await api.bookmarks.getChildren(parityRoot)).filter(e=>e.url&&e.type!=="separator").map(e=>e.id).join()===[parityIds[1],parityIds[2],parityIds[0]].join();',
  );
  if (name === 'firefox')
    assert.equal(await exec('return (await api.bookmarks.get(paritySeparator))[0].index;'), 1);
  await exec(
    'for(let i=0;i<22;i++)await api.bookmarks.create({parentId:parityRoot,title:"Overflow folder "+i});',
  );
  await until('return document.querySelectorAll(".folder-tab").length===24;');
  for (const width of [360, 1280]) {
    await resize(width, 800);
    assert.equal(
      await exec(
        'return document.documentElement.scrollWidth<=innerWidth && document.querySelector(".folder-tabs").getAttribute("aria-hidden")!=="true";',
      ),
      true,
    );
  }
  await exec('document.querySelector(".folder-root").focus();');
  await key('/');
  await until('return document.activeElement?.getAttribute("aria-label")==="Поиск по закладкам";');
  await field('.search input', '  IMPORTED  ');
  await until('return document.querySelectorAll(".bookmark").length===1;');
  assert.equal(await exec('return document.querySelector(".bookmark").draggable;'), false);
  await key('Escape');
  await until('return document.querySelector(".search input").value === "";');
  await click('Настройки');
  await until('return !!document.querySelector(".settings");');
  await key('Tab');
  assert.equal(await exec('return !!document.activeElement.closest("dialog");'), true);
  assert.equal(
    await exec('return getComputedStyle(document.querySelector(".settings")).backdropFilter;'),
    'blur(12px) saturate(1.6)',
  );
  await close();
  console.log(
    'PASS ' +
      name +
      ': mixed-slot sorting, scrolling alignment, unified bookmark search, / and Escape, Tab, glass material',
  );

  await exec(`window.parityFetch=window.fetch;window.mailCalls=[];window.fetch=(url,options)=>{
  if(String(url).startsWith('https://portal.mail.ru/NaviData?')){mailCalls.push({url:String(url),credentials:options.credentials});return Promise.resolve(new Response(JSON.stringify({data:{mail_cnt:123}}),{headers:{'Content-Type':'application/json'}}));}return parityFetch(url,options);
 };await api.storage.local.set({settings:{value:{...${JSON.stringify(exported.settings)},mailruEnabled:true}}});`);
  await until('return document.querySelector(".mail .badge")?.textContent==="99+";');
  assert.equal(
    await exec(
      'return mailCalls.length===1&&mailCalls[0].credentials==="include"&&!new URL(mailCalls[0].url).searchParams.has("Login");',
    ),
    true,
  );
  assert.equal(
    await exec('return document.querySelector(".mail").href;'),
    'https://e.mail.ru/messages/inbox/',
  );
  await exec(
    'const {settings}=await api.storage.local.get("settings");await api.storage.local.set({settings:{value:{...settings.value,mailruEnabled:false}}});',
  );
  await until('return !document.querySelector(".mail");');
  await exec(`window.fetch=(url,options)=>String(url).startsWith('https://portal.mail.ru/NaviData?')?Promise.resolve(new Response(JSON.stringify({status:'noauth'}))):parityFetch(url,options);
 const {settings}=await api.storage.local.get('settings');await api.storage.local.set({settings:{value:{...settings.value,mailruEnabled:true}}});`);
  await until(
    'return document.querySelector(".mail-error")?.textContent.includes("Войдите в Mail.ru");',
  );
  assert.equal(await exec('return !!document.querySelector(".mail .badge");'), false);
  assert.deepEqual(await exec('return parityErrors;'), []);
  console.log(
    'PASS ' +
      name +
      ': Mail.ru credentialed request, count, badge, account change and noauth error (controlled responses)',
  );
  await driver.pointer('.settings-trigger');
  await until('return !!document.querySelector(".settings");');
  assert.equal(
    await exec('return getComputedStyle(document.querySelector(".settings .close")).outlineStyle;'),
    'none',
    'mouse must not show a focus outline',
  );
  await key('Tab');
  await exec('document.querySelector(".settings .close").focus();');
  assert.notEqual(
    await exec('return getComputedStyle(document.activeElement).outlineStyle;'),
    'none',
    'keyboard must retain its focus outline',
  );
  await close();
  await driver.pointer('.search input');
  assert.equal(
    await exec('return getComputedStyle(document.querySelector(".search input")).outlineStyle;'),
    'none',
  );
  await field('.search input', '   ');
  assert.equal(await exec('return document.querySelector(".search-submit").disabled;'), true);
  await click('Очистить поисковый запрос');
  assert.equal(
    await exec(
      'return document.activeElement===document.querySelector(".search input")&&document.activeElement.value==="";',
    ),
    true,
  );
  await exec(
    'document.querySelector(".bookmark").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:innerWidth-1,clientY:innerHeight-1}));',
  );
  await until('return !!document.querySelector("[role=menu]");');
  assert.equal(
    await exec(
      'const r=document.querySelector("[role=menu]").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;',
    ),
    true,
  );
  await key('ArrowDown');
  assert.equal(await exec('return document.activeElement.getAttribute("role");'), 'menuitem');
  await key('Escape');
  await until('return !document.querySelector("[role=menu]");');
  console.log(
    'PASS ' +
      name +
      ': native pointer/keyboard focus, disabled whitespace search, clear focus, context menu bounds and keyboard',
  );
}
await runSharedScenario('browser-parity', async (browser, driver) => {
  await check(browser, { ...driver, system: (value) => driver.media({ colorScheme: value }) });
  assert.deepEqual(await driver.errors(), []);
  driver.caseDone('shared-behavior');
});
