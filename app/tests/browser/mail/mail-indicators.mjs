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
const out = resolve('.browser-test/mail-indicators');
await mkdir(out, { recursive: true });
async function check(name, { exec, until, key, resize, reload, shot, caseDone, media }) {
  await until(
    'return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;',
  );
  await exec(
    'window.api=globalThis.browser??chrome;window.mailCalls=[];window.mailMode="five";window.mailTarget="all";window.originalFetch=fetch;window.mailScriptExecuted=false;window.fetch=async (url,options)=>{const text=String(url),id=text.startsWith("https://portal.mail.ru/")?"mailru":text==="https://mail.google.com/mail/u/0/feed/atom"?"gmail":text==="https://mail.yandex.ru/api/v2/serp/counters?silent"?"yandex":null;if(!id)return window.originalFetch(url,options);window.mailCalls.push({url:text,id,credentials:options.credentials,signal:options.signal});const mode=window.mailTarget==="all"||window.mailTarget===id?window.mailMode:"five";if(mode==="discover"&&id==="mailru"&&!new URL(text).searchParams.has("Login"))return new Response(JSON.stringify({status:"ok",data:{email:"automatic@mail.ru",list:["other@mail.ru","automatic@mail.ru"]}}));if(mode==="offline")throw new TypeError("offline");if(mode==="timeout")return new Promise((_,reject)=>options.signal.addEventListener("abort",()=>reject(options.signal.reason),{once:true}));if(mode==="server")return new Response("error",{status:500});if(mode==="unsupported")return new Response("missing",{status:404});if(mode==="slow"&&id==="mailru")return new Promise(resolve=>{window.lateMail=()=>resolve(new Response(JSON.stringify({data:{mail_cnt:99}})));});if(mode==="noauth")return id==="mailru"?new Response(JSON.stringify({status:"noauth"})):new Response("noauth",{status:401});if(mode==="html")return new Response("<html><script>window.mailScriptExecuted=true</script>Login</html>");const count=mode==="zero"?0:mode==="big"?1000:mode==="negative"?-1:5;if(id==="gmail"){const namespace=mode==="wrongnamespace"?"https://attacker.invalid/":"http://purl.org/atom/ns#";let field="<fullcount>"+count+"</fullcount>";if(mode==="duplicate")field+=field;if(mode==="nested")field="<entry>"+field+"</entry>";if(mode==="dtd")return new Response(\'<!DOCTYPE feed [<!ENTITY count "5">]><feed xmlns="http://purl.org/atom/ns#"><fullcount>&count;</fullcount></feed>\');return new Response("<feed xmlns=\\""+namespace+"\\">"+field+"<entry><title>&lt;script&gt;window.mailScriptExecuted=true&lt;/script&gt;</title></entry></feed>");}return new Response(JSON.stringify(id==="mailru"?{data:{mail_cnt:count}}:{counters:{unread:count,fresh:9}}));};window.setMail=async patch=>{const {settings}=await api.storage.local.get("settings");await api.storage.local.set({settings:{value:{...settings?.value,...patch}}});};window.refreshMail=async()=>{const {settings}=await api.storage.local.get("settings"),saved=settings.value;await window.setMail({mailruEnabled:false,gmailEnabled:false,yandexMailEnabled:false});const start=Date.now();while(document.querySelector(".mail")){if(Date.now()-start>3000)throw Error("Mail did not unmount");await new Promise(r=>setTimeout(r,20));}await window.setMail({mailruEnabled:saved.mailruEnabled,gmailEnabled:saved.gmailEnabled,yandexMailEnabled:saved.yandexMailEnabled});};',
  );
  const bookmarksBefore = await exec('return JSON.stringify(await api.bookmarks.getTree());');
  assert.equal(await exec('return document.querySelectorAll(".mail").length;'), 0);
  await exec(
    'await window.setMail({mailruEnabled:true,gmailEnabled:true,yandexMailEnabled:true,weatherEnabled:true});',
  );
  await until(
    'return document.querySelectorAll(".mail").length===3&&document.querySelector("[data-provider=mailru]")?.dataset.status==="ready";',
  );
  assert.equal(
    await exec('return document.querySelector("[data-provider=mailru] .badge").textContent;'),
    '5',
  );
  assert.equal(
    await exec('return document.querySelector("[data-provider=mailru] a").title;'),
    'Mail.ru',
  );
  assert.deepEqual(await exec('return [...document.querySelectorAll(".mail")].map(e=>e.href);'), [
    'https://e.mail.ru/messages/inbox/',
    'https://mail.google.com/mail/u/0/',
    'https://mail.yandex.ru/',
  ]);
  for (const id of ['mailru', 'gmail', 'yandex']) {
    await until(
      'return document.querySelector("[data-provider=' + id + ']")?.dataset.status==="ready";',
    );
    assert.equal(
      await exec('return document.querySelector("[data-provider=' + id + '] .badge").textContent;'),
      '5',
    );
  }
  assert.equal(
    await exec('return window.mailCalls.every(call=>call.credentials==="include");'),
    true,
  );
  await exec(
    'window.mailActivated=[];for(const a of document.querySelectorAll(".mail"))a.addEventListener("click",e=>{e.preventDefault();window.mailActivated.push(a.href);});',
  );
  for (const id of ['mailru', 'gmail', 'yandex']) {
    await exec('document.querySelector("[data-provider="+arguments[0]+"] a").focus();', id);
    await key('Enter');
  }
  await until('return window.mailActivated.length===3;');
  await exec(
    'window.mailTarget="mailru";window.mailMode="discover";window.previousMailCalls=window.mailCalls.length;await window.refreshMail();',
  );
  await until(
    'return window.mailCalls.slice(window.previousMailCalls).some(call=>call.url.includes("Login=automatic%40mail.ru"))&&document.querySelector("[data-provider=mailru]")?.dataset.status==="ready";',
  );
  assert.equal(
    await exec('return window.mailCalls.some(call=>call.url.includes("unused%40mail.ru"));'),
    false,
  );
  await exec('window.mailTarget="all";');
  for (const mode of [
    'zero',
    'big',
    'noauth',
    'offline',
    'html',
    'server',
    'timeout',
    'unsupported',
    'negative',
  ]) {
    await exec(
      'window.previousMailCalls=window.mailCalls.length;window.mailMode=arguments[0];await window.refreshMail();',
      mode,
    );
    await until(
      'return window.mailCalls.length>window.previousMailCalls&&[...document.querySelectorAll(".mail-control")].every(e=>e.dataset.status!=="loading");',
    );
    const state = await exec(
      'return {status:document.querySelector("[data-provider=mailru]")?.dataset.status,badge:document.querySelector("[data-provider=mailru] .badge")?.textContent??null,title:document.querySelector("[data-provider=mailru] a").title};',
    );
    assert.equal(state.badge, mode === 'big' ? '99+' : null);
    assert.equal(
      state.status,
      ['zero', 'big'].includes(mode) ? 'ready' : mode === 'noauth' ? 'unauthenticated' : 'error',
    );
    for (const id of ['gmail', 'yandex']) {
      const status = await exec(
        'return document.querySelector("[data-provider=' + id + ']")?.dataset.status;',
      );
      assert.equal(
        status,
        ['zero', 'big'].includes(mode)
          ? 'ready'
          : mode === 'noauth'
            ? 'unauthenticated'
            : mode === 'unsupported'
              ? 'unsupported'
              : 'error',
      );
      assert.equal(
        await exec(
          'return document.querySelector("[data-provider=' + id + '] .badge")?.textContent??null;',
        ),
        mode === 'big' ? '99+' : null,
      );
    }
  }
  for (const mode of ['dtd', 'duplicate', 'nested', 'wrongnamespace']) {
    await exec(
      'window.mailTarget="gmail";window.mailMode=arguments[0];await window.refreshMail();',
      mode,
    );
    await until(
      'return document.querySelector("[data-provider=gmail]")?.dataset.status==="error";',
    );
    assert.equal(
      await exec('return !!document.querySelector("[data-provider=gmail] .badge");'),
      false,
    );
    assert.equal(await exec('return window.mailScriptExecuted;'), false);
  }
  await exec('window.mailTarget="mailru";window.mailMode="offline";await window.refreshMail();');
  await until(
    'return document.querySelector("[data-provider=mailru]")?.dataset.status==="error"&&document.querySelector("[data-provider=gmail]")?.dataset.status==="ready"&&document.querySelector("[data-provider=yandex]")?.dataset.status==="ready";',
  );
  await exec('window.mailTarget="all";window.mailMode="slow";await window.refreshMail();');
  await until('return !!window.lateMail;');
  await exec('window.mailMode="five";await window.refreshMail();');
  await until('return document.querySelector("[data-provider=mailru] .badge")?.textContent==="5";');
  await exec('window.lateMail();await new Promise(r=>setTimeout(r,150));');
  assert.equal(
    await exec('return document.querySelector("[data-provider=mailru] .badge").textContent;'),
    '5',
  );

  for (const theme of ['light', 'dark'])
    for (const width of [320, 360, 768, 1024, 1280, 1920]) {
      await resize(width, 800);
      await exec(
        'await window.setMail({theme:arguments[0]});await new Promise(r=>setTimeout(r,250));',
        theme,
      );
      const boxes = await exec(
        'const es=[...document.querySelectorAll(".mail,.weather-widget,.settings-trigger,.search")];return {overflow:document.documentElement.scrollWidth>innerWidth,items:es.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}),width:innerWidth};',
      );
      assert.equal(boxes.overflow, false);
      for (let i = 0; i < boxes.items.length; i++) {
        const a = boxes.items[i];
        assert(a.left >= 0 && a.right <= boxes.width + 1);
        for (const b of boxes.items.slice(i + 1))
          assert(
            Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 ||
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1,
            'toolbar overlap at ' + width,
          );
      }
      if (width === 360 || width === 1280) await shot(name + '-' + theme + '-' + width);
    }
  await exec('document.querySelector(".settings-trigger").click();');
  await until('return !!document.querySelector("#settings-modal");');
  for (const label of ['Показывать Mail.ru', 'Показывать Gmail', 'Показывать Яндекс Почту'])
    assert.equal(
      await exec(
        'return [...document.querySelectorAll("label")].filter(e=>e.textContent.trim()===arguments[0]).length;',
        label,
      ),
      1,
    );
  assert.equal(await exec('return document.querySelectorAll(".settings .badge").length;'), 0);
  await key('Escape');
  await until('return !document.querySelector("#settings-modal");');
  await openData(exec, until);
  const backup = await captureBackup(exec, until);
  assert.equal(backup.settings.gmailEnabled, true);
  assert.equal(backup.settings.yandexMailEnabled, true);
  assert.equal(Object.hasOwn(backup.settings, 'email'), false);
  await exec('await window.setMail({gmailEnabled:false,yandexMailEnabled:false});');
  // storage.local.set resolves before the settings listener updates Vue. Import
  // captures those settings for its conflict check, so wait for the rendered change.
  await until(
    'return !document.querySelector("[data-provider=gmail]")&&!document.querySelector("[data-provider=yandex]");',
  );
  await chooseBackup(exec, {
    version: 3,
    bookmarks: false,
    entries: [],
    settings: backup.settings,
  });
  await until('return !!document.querySelector(".import-summary");');
  await dataClick(exec, 'Импортировать');
  await until(
    'return document.querySelector(".data-result")?.textContent.includes("Настройки применены");',
  );
  await dataClick(exec, 'Готово');
  await until('return !document.querySelector("dialog");');
  await until('return document.querySelectorAll(".mail").length===3;');
  await exec('document.querySelector(".settings-trigger").click();');
  await until('return !!document.querySelector("#settings-modal");');
  for (const label of ['Показывать Mail.ru', 'Показывать Gmail', 'Показывать Яндекс Почту']) {
    await exec(
      '[...document.querySelectorAll(".switch-control")].find(e=>e.textContent.trim()===arguments[0]).querySelector("input").click();',
      label,
    );
    await until(
      'return ![...document.querySelectorAll(".switch-control")].find(e=>e.textContent.trim()===' +
        JSON.stringify(label) +
        ').querySelector("input").checked;',
    );
  }
  await key('Escape');
  await until('return !document.querySelector("dialog")&&!document.querySelector(".mail");');
  await reload();
  await until('return !!document.querySelector(".folder-root");');
  assert.equal(await exec('return document.querySelectorAll(".mail").length;'), 0);
  assert.equal(
    await exec('return JSON.stringify(await (globalThis.browser??chrome).bookmarks.getTree());'),
    bookmarksBefore,
  );
  caseDone('mail-behavior');
  await exec(
    `const realFetch=window.fetch;window.fetch=(url,options)=>String(url)==="https://mail.google.com/mail/u/0/feed/atom"?Promise.resolve(new Response('<feed xmlns="http://purl.org/atom/ns#"><fullcount>5</fullcount></feed>')):realFetch(url,options);const api=globalThis.browser??chrome;const {settings}=await api.storage.local.get('settings');await api.storage.local.set({settings:{value:{...settings?.value,gmailEnabled:true}}});`,
  );
  await until('return document.querySelectorAll(".mail").length===1;');
  await media({ forcedColors: 'active', reducedMotion: 'reduce' });
  await key('Tab');
  await exec('document.querySelector(".mail").focus();');
  assert.notEqual(
    await exec('return getComputedStyle(document.querySelector(".mail")).outlineStyle;'),
    'none',
  );
  await shot(name + '-forced-colors');
  caseDone('mail-accessibility');
  console.log(
    'PASS ' +
      name +
      ': three icons, accurate count/status, unknown never zero, no polling, races, settings/backup, explicit disable/reload, both themes and responsive geometry',
  );
}

await runSharedScenario('mail-indicators', check, {
  shotPath: (label) => resolve(out, label + '.png'),
});
