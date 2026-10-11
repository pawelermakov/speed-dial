import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchFirefox, firefoxUrl } from './firefox-driver.mjs';

export async function firefoxSmoke(siteUrl, results) {
  let driver = await launchFirefox();
  const profile = driver.profile;
  const fixture = await readFile('tests/fixtures/legacy-export.json', 'utf8');
  const image = await readFile('public/images/icon128.png');
  const dataUrl = 'data:image/png;base64,' + image.toString('base64');
  const click = selector => driver.exec('document.querySelector(arguments[0]).click(); await new Promise(resolve=>requestAnimationFrame(resolve));', selector);
  const ready = () => driver.until('return !document.querySelector(\'button[aria-label="Настройки"]\').disabled && !document.querySelector("[inert]");');
  const state = () => driver.exec('const db = await new Promise((resolve, reject) => { const r=indexedDB.open("SpeedDialX"); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); const tx=db.transaction(["bookmarks","assets"]); const requests=[tx.objectStore("bookmarks").getAll(),tx.objectStore("assets").get("background")]; const [tabs,bg]=await Promise.all(requests.map(r=>new Promise(resolve=>{r.onsuccess=()=>resolve(r.result);}))); db.close(); return { tabs:tabs.sort((a,b)=>a.position-b.position).map(t=>({id:t.id,url:t.url,title:t.title,position:t.position,thumbnail:t.thumbnail?.size??0})), background:bg?.blob.size??0 };');
  const fill = (selector, value) => driver.exec('const input=document.querySelector(arguments[0]); input.value=arguments[1]; input.dispatchEvent(new Event("input",{bubbles:true}));', selector, value);
  const menu = async (index, name) => {
    await driver.exec('document.querySelectorAll(".bookmark")[arguments[0]].dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:30,clientY:100})); await new Promise(resolve=>requestAnimationFrame(resolve));', index);
    await driver.exec('Array.from(document.querySelectorAll("[role=menuitem]")).find(e=>e.textContent===arguments[0]).click();', name);
  };
  const panel = () => click('button[aria-label="Настройки"]');
  const panelAction = name => driver.exec('Array.from(document.querySelectorAll(".settings button")).find(e=>e.textContent===arguments[0]).click();', name);
  try {
    await driver.command('WebDriver:Navigate', { url: firefoxUrl }); await ready();
    assert.equal((await state()).tabs.length, 0);
    results.push('firefox: real Firefox 157 newtab and clean installation');
    await driver.exec('window.confirm=()=>true;');
    await click('main .text-center .button');
    await driver.until('return !!document.querySelector("dialog input");');
    await fill('dialog input', siteUrl);
    await click('dialog .button');
    await driver.until('return !document.querySelector("dialog");', 30000);
    await ready();
    let stored = await state();
    assert.ok(stored.tabs[0].thumbnail > 0);
    assert.equal(stored.tabs[0].title, 'Локальный сайт');
    assert.equal((await driver.command('WebDriver:GetWindowHandles')).length, 1);
    const captureScreen = await driver.command('WebDriver:TakeScreenshot', { full: true });
    await writeFile(resolve('.browser-test', 'firefox-capture.png'), Buffer.from(captureScreen, 'base64'));
    const pair = await driver.exec('const before=(await browser.tabs.query({})).map(t=>t.id).sort(); const capture=id=>new Promise((resolve,reject)=>{const port=browser.runtime.connect({name:"speed-dial-capture"});const timeout=setTimeout(()=>{port.disconnect();reject(new Error("capture timeout"));},15000);port.onMessage.addListener(r=>{clearTimeout(timeout);port.disconnect();resolve({id:r.requestId,title:r.title,bytes:r.thumbnail?.length,error:r.error});});port.postMessage({type:"capture",requestId:id,url:arguments[0]});});const captures=await Promise.all([capture("pair-a"),capture("pair-b")]);const after=(await browser.tabs.query({})).map(t=>t.id).sort();return {before,after,captures};',siteUrl);
    assert.deepEqual(pair.after, pair.before);
    assert.deepEqual(pair.captures.map(r=>r.id), ['pair-a','pair-b']);
    assert.ok(pair.captures.every(r=>!r.error && r.title==='Локальный сайт' && r.bytes>0));
    results.push('firefox: real captureVisibleTab, paired queue responses, title and tab cleanup');

    await menu(0, 'Изменить');
    await fill('dialog input:nth-of-type(1)', siteUrl); // URL field in first label.
    await driver.exec('const input=document.querySelectorAll("dialog input")[1]; input.value="Мой заголовок <b>текст</b>"; input.dispatchEvent(new Event("input",{bubbles:true}));');
    await click('dialog .button'); await ready();
    await menu(0, 'Обновить эскиз'); await ready();
    assert.equal((await state()).tabs[0].title, 'Мой заголовок <b>текст</b>');
    assert.equal(await driver.exec('return document.querySelectorAll(".bookmark b").length;'), 0);
    results.push('firefox: edit, refresh and safe title rendering');

    await driver.exec('document.querySelector("main").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:20,clientY:250}));');
    await driver.exec('document.querySelector("[role=menuitem]").click();');
    await fill('dialog input', siteUrl + '/never');
    await click('dialog .button');
    await driver.until('return Array.from(document.querySelectorAll("dialog button")).some(b=>b.textContent==="Сохранить без эскиза");', 30000);
    await driver.exec('Array.from(document.querySelectorAll("dialog button")).find(b=>b.textContent==="Сохранить без эскиза").click();');
    await ready();
    assert.equal((await state()).tabs.length, 2);
    results.push('firefox: real timeout and save without screenshot');

    // Native DnD handlers receive the same DragEvent sequence as browser input.
    await driver.exec('const cards=document.querySelectorAll(".bookmark"); const transfer=new DataTransfer(); cards[0].dispatchEvent(new DragEvent("dragstart",{bubbles:true,dataTransfer:transfer})); cards[1].dispatchEvent(new DragEvent("dragenter",{bubbles:true,dataTransfer:transfer})); cards[1].dispatchEvent(new DragEvent("drop",{bubbles:true,dataTransfer:transfer})); cards[0].dispatchEvent(new DragEvent("dragend",{bubbles:true,dataTransfer:transfer}));');
    await ready();
    assert.equal((await state()).tabs[1].title, 'Мой заголовок <b>текст</b>');
    await driver.command('WebDriver:Refresh'); await ready();
    assert.equal((await state()).tabs[1].title, 'Мой заголовок <b>текст</b>');
    await driver.exec('window.confirm=()=>false;');
    await menu(0, 'Удалить');
    assert.equal((await state()).tabs.length, 2);
    await driver.exec('window.confirm=()=>true;');
    await menu(0, 'Удалить'); await ready();
    assert.equal((await state()).tabs.length, 1);
    results.push('firefox: reorder persists on reload; cancel/confirm delete');

    await panel(); await panelAction('Импорт');
    await fill('dialog textarea', 'broken JSON'); await click('dialog .button');
    await driver.until('return document.querySelector("[role=alert]")?.textContent.includes("Некорректный JSON");');
    assert.equal((await state()).tabs.length, 1);
    await fill('dialog textarea', fixture); await click('dialog .button'); await ready();
    assert.equal((await state()).tabs.length, 2);
    assert.equal(await driver.exec('return !!document.querySelector(".add-card");'), false);
    results.push('firefox: invalid JSON preserves data and legacy import works');

    await panel();
    await fill('.settings input[type=number]', '80');
    await driver.exec('const input=document.querySelectorAll(".settings input[type=number]")[2]; input.value="0"; input.dispatchEvent(new Event("input",{bubbles:true}));');
    await driver.exec('const file=new File([Uint8Array.from(atob(arguments[0].split(",")[1]),c=>c.charCodeAt(0))],"background.png",{type:"image/png"}); const transfer=new DataTransfer(); transfer.items.add(file); const input=document.querySelector(".settings input[type=file]"); input.files=transfer.files; input.dispatchEvent(new Event("change",{bubbles:true}));', dataUrl);
    await driver.until('return !document.querySelector(".settings form .button").disabled;');
    await click('.settings form .button'); await ready();
    assert.equal((await state()).background, image.length);

    await panel(); await panelAction('Экспорт');
    await driver.until('return !!document.querySelector("dialog textarea");');
    const exported = JSON.parse(await driver.exec('return document.querySelector("dialog textarea").value;'));
    assert.equal(exported.settings.background, dataUrl);
    assert.equal(exported.settings.space, 0);
    assert.equal(exported.tabs[0].thumbnail, '');
    await click('dialog .close');
    results.push('firefox: settings/background in IndexedDB and export round trip');

    for (const [width, height] of [[360,800],[1280,800],[1920,1080]]) {
      await driver.command('WebDriver:SetWindowRect', { width, height });
      assert.ok(await driver.exec('return document.documentElement.scrollWidth<=innerWidth;'));
      const screenshot = await driver.command('WebDriver:TakeScreenshot', { full: true });
      await writeFile(resolve('.browser-test', 'firefox-' + width + '.png'), Buffer.from(screenshot, 'base64'));
    }
        // Firefox's native headless window has a 500px minimum. Exercise the
    // exact 360×800 CSS viewport in a same-origin iframe and capture its bounds.
    await driver.command('WebDriver:SetWindowRect', { width: 1000, height: 1000 });
    await driver.exec('const frame=document.createElement("iframe");frame.id="test-viewport";frame.src=arguments[0];frame.width="360";frame.height="800";frame.style.cssText="position:absolute;left:0;top:0;border:0";document.body.append(frame);', firefoxUrl);
    await driver.until('const doc=document.querySelector("#test-viewport")?.contentDocument;return doc?.querySelector(\'button[aria-label="Настройки"]\')?.disabled===false;');
    assert.ok(await driver.exec('const w=document.querySelector("#test-viewport").contentWindow;return w.innerWidth===360 && w.innerHeight===800 && w.document.documentElement.scrollWidth===360;'));
    const frameElement = await driver.command('WebDriver:FindElement', { using: 'css selector', value: '#test-viewport' });
    const smallScreenshot = await driver.command('WebDriver:TakeScreenshot', { id: Object.values(frameElement)[0], full: false });
    await writeFile(resolve('.browser-test', 'firefox-360.png'), Buffer.from(smallScreenshot, 'base64'));
    await driver.exec('document.querySelector("#test-viewport").remove();');
    results.push('firefox: rendered 360×800 iframe / 1280 / 1920 layouts with no horizontal overflow');
    const live = await driver.exec('const probe=async url=>{try{const response=await fetch(url,{signal:AbortSignal.timeout(10000),credentials:"include"});const json=await response.json();return {status:response.status,suggestions:Array.isArray(json[1])?json[1].length:undefined,mailStatus:json.status};}catch(error){return {error:String(error)};}};return {yandex:await probe("https://suggest.yandex.ru/suggest-sl?part=speed%20dial"),mail:await probe("https://portal.mail.ru/NaviData?mac=1")};');
    results.push('firefox: live network ' + JSON.stringify(live));
    const before = await state();
    await driver.close();
    driver = await launchFirefox(profile);
    await driver.command('WebDriver:Navigate', { url: firefoxUrl }); await ready();
    assert.deepEqual(await state(), before);
    results.push('firefox: browser restart retains bookmarks, order, settings and background');
    await driver.exec('window.confirm=()=>true;');
    await panel(); await panelAction('Удалить все данные'); await ready();
    assert.deepEqual((await state()), { tabs: [], background: 0 });
    results.push('firefox: reset restores empty state');
  } catch (error) { console.error('Firefox body:', await driver.exec('return document.body.innerText;').catch(() => 'unavailable')); throw error; } finally { await driver.close(); }
}
