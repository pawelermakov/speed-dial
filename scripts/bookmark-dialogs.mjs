import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { launchFirefox, firefoxUrl } from './firefox-driver.mjs';
const out=resolve('.browser-test/bookmark-dialogs');await mkdir(out,{recursive:true});
const icon=await readFile('public/images/icon128.png'),png='data:image/png;base64,'+icon.toString('base64');
const server=createServer((req,res)=>{if(req.url==='/favicon.ico'){res.setHeader('Content-Type','image/png');res.end(icon);}else{res.setHeader('Content-Type','text/html');res.end('<title>Actual local page</title><body>Capture fixture</body>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const site='http://127.0.0.1:'+server.address().port;
if (!process.argv.includes('--firefox-only')) {
const context=await chromium.launchPersistentContext(resolve('.browser-test/bookmark-dialogs-'+crypto.randomUUID()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+resolve('.output/chrome-mv3'),'--load-extension='+resolve('.output/chrome-mv3')]});
try {
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(worker.url().replace('background.js','newtab.html'));await expect(page.getByRole('button',{name:'Новая закладка',exact:true})).toBeEnabled();
 const fixture=await page.evaluate(async()=>{const root=(await chrome.storage.local.get('rootFolderId')).rootFolderId;const settings=(await chrome.storage.local.get('settings')).settings;await chrome.storage.local.set({settings:{value:{...settings?.value,addButton:true}}});const a=await chrome.bookmarks.create({parentId:root,title:'Work'});return{root,a:a.id};});
 await expect(page.getByRole('button',{name:'Work',exact:true})).toBeVisible();await page.getByRole('button',{name:'Work',exact:true}).click();
 await page.evaluate(png=>{
  window.captureCalls=[];window.captureTitle='Captured Page';window.captureFail=false;
  const connect=chrome.runtime.connect;chrome.runtime.connect=(options)=>{
   if(options?.name!=='speed-dial-capture')return connect.call(chrome.runtime,options);
   let listener;return {onMessage:{addListener:f=>listener=f,removeListener:()=>{}},onDisconnect:{addListener:()=>{},removeListener:()=>{}},disconnect:()=>{},postMessage:request=>{window.captureCalls.push(request.url);setTimeout(()=>listener({requestId:request.requestId,title:window.captureTitle,thumbnail:png,favicon:'',...(window.captureFail?{error:'Test capture failed'}:{})}),100);}};
  };
 },png);
 const open=async()=>{await page.getByRole('button',{name:'Новая закладка',exact:true}).click();await expect(page.locator('dialog')).toBeVisible();await expect.poll(()=>page.locator('dialog').evaluate(e=>getComputedStyle(e).opacity)).toBe('1');await expect(page.locator('.page-background')).toHaveCSS('filter','none');await expect(page.locator('.dial')).toHaveCSS('filter','none');await expect(page.locator('dialog')).toHaveCSS('background-color','rgba(8, 14, 25, 0.2)');};
 const url=()=>page.getByLabel('Адрес сайта',{exact:true}),title=()=>page.getByLabel('Название',{exact:true}),folder=()=>page.getByLabel('Папка',{exact:true});
 const rows=()=>page.evaluate(id=>chrome.bookmarks.getChildren(id),fixture.a);
 const edit=async()=>{await page.locator('.bookmark').last().click({button:'right'});await page.getByRole('menuitem',{name:'Изменить закладку',exact:true}).click();await expect(page.locator('dialog')).toBeVisible();await expect.poll(()=>page.locator('dialog').evaluate(e=>getComputedStyle(e).opacity)).toBe('1');await expect(page.locator('.page-background')).toHaveCSS('filter','none');await expect(page.locator('.dial')).toHaveCSS('filter','none');await expect(page.locator('dialog')).toHaveCSS('background-color','rgba(8, 14, 25, 0.2)');};
 const submit=async()=>{await page.locator('dialog button[type=submit]').click();await expect(page.locator('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Новая закладка',exact:true})).toBeEnabled({timeout:10000});};
 const ticket=async id=>page.evaluate(async id=>{const db=await new Promise(r=>{const req=indexedDB.open('SpeedDialX');req.onsuccess=()=>r(req.result);});const value=await new Promise(r=>{const req=db.transaction('autoNames').objectStore('autoNames').get(id);req.onsuccess=()=>r(req.result);});db.close();return value;},id);
 await open();await expect(folder()).toHaveValue(fixture.a);await expect(url()).toBeFocused();await expect(page.getByLabel('Создать эскиз сайта',{exact:true})).toBeChecked();
 await page.getByRole('button',{name:'О создании эскиза',exact:true}).hover();await expect(page.locator('#bookmark-capture-info')).toBeVisible();await expect(page.locator('#bookmark-capture-info')).toContainText('Сайт временно откроется');await expect.poll(()=>page.locator('#bookmark-capture-info').evaluate(e=>getComputedStyle(e).opacity)).toBe('1');const helpBox=await page.getByRole('button',{name:'О создании эскиза',exact:true}).boundingBox(),tooltipBox=await page.locator('#bookmark-capture-info').boundingBox();assert.ok(Math.abs(tooltipBox.x+tooltipBox.width/2-(helpBox.x+helpBox.width/2))<1);await page.screenshot({path:resolve(out,'capture-tooltip.png')});await url().hover();await expect(page.locator('#bookmark-capture-info')).toBeHidden();await page.getByRole('button',{name:'О создании эскиза',exact:true}).focus();await expect(page.locator('#bookmark-capture-info')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#bookmark-capture-info')).toBeHidden();await expect(page.locator('dialog')).toBeVisible();await url().focus();
 for(const width of [360,1280,1920]){await page.setViewportSize({width,height:800});assert(await page.locator('dialog section').evaluate(e=>e.scrollWidth<=e.clientWidth));await page.screenshot({path:resolve(out,'add-'+width+'.png')});}
 await expect(page.locator('dialog button[type=submit]')).toBeDisabled();await page.locator('.bookmark-form').evaluate(form=>form.requestSubmit());await expect(page.locator('#bookmark-url-error')).toBeVisible();await url().fill('   ');await expect(page.locator('dialog button[type=submit]')).toBeDisabled();for(const value of ['javascript:alert(1)','data:text/html,bad','https://','foo','https://bad..com','https://-bad.com','https://a b.com','1','12','123','1.2','1.2.3','https://123','example.c','https://a.b']){await url().fill(value);await expect(page.locator('dialog button[type=submit]')).toBeDisabled();}for(const value of ['example.com','https://example.com/path','http://localhost:8080/','https://пример.рф/','123.com','a.co','http://127.0.0.1/','http://[::1]/']){await url().fill(value);await expect(page.locator('dialog button[type=submit]')).toBeEnabled();}await expect(title()).not.toHaveAttribute('placeholder');await expect(url()).not.toHaveAttribute('placeholder');assert.deepEqual(await page.locator('.bookmark-form .ui-control,.bookmark-form button[type=submit]').evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().height)),[40,40,40,40]);assert.equal((await rows()).length,0);
 await url().fill(site+'/first');await page.getByLabel('Создать эскиз сайта',{exact:true}).uncheck();await submit();let id=(await rows())[0].id;assert.equal((await rows())[0].title,'127.0.0.1');assert(await ticket(id));assert.equal(await page.evaluate(()=>window.captureCalls.length),0);
 await edit();await expect(title()).toHaveValue('127.0.0.1');await url().fill(site+'/second');await submit();assert.equal((await rows())[0].title,'Captured Page');assert.equal(await ticket(id),undefined);assert.equal(await page.evaluate(()=>window.captureCalls.length),1);
 await edit();await title().fill('My name');await submit();assert.equal(await page.evaluate(()=>window.captureCalls.length),1);
 await edit();await url().fill(site+'/third');await submit();assert.equal((await rows())[0].title,'My name');assert.equal(await page.evaluate(()=>window.captureCalls.length),2);
 await edit();await title().fill('');await submit();assert(await ticket(id));
 await page.evaluate(async id=>{await chrome.bookmarks.update(id,{title:'External'});await chrome.bookmarks.update(id,{title:'127.0.0.1'});},id);await expect.poll(()=>ticket(id)).toBeFalsy();
 await open();await expect(page.getByLabel('Создать эскиз сайта',{exact:true})).toBeChecked();await url().fill(site+'/new');await title().fill('User title');await submit();assert.equal((await rows()).length,2);assert.equal((await rows())[1].title,'User title');
 await edit();await title().fill('Unsaved');await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);assert.equal((await rows())[1].title,'User title');
 await open();await url().fill(site+'/failure');await page.evaluate(()=>window.captureFail=true);await submit();assert.equal((await rows()).length,3);assert.equal((await rows())[2].title,'127.0.0.1');await expect(page.getByRole('status')).toContainText('Закладка сохранена');await page.evaluate(()=>window.captureFail=false);
 await open();await url().fill(site+'/api');await page.evaluate(()=>{const original=chrome.bookmarks.create;window.restoreCreate=()=>chrome.bookmarks.create=original;chrome.bookmarks.create=async()=>{throw Error('Test API denied');};});await page.locator('dialog button[type=submit]').click();await expect(page.locator('dialog [role=alert]')).toContainText('Test API denied');await expect(url()).toHaveValue(site+'/api');await page.evaluate(()=>window.restoreCreate());await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);
 await open();await url().fill(site+'/stale');const stale=await page.evaluate(async root=>(await chrome.bookmarks.create({parentId:root,title:'Temporary'})).id,fixture.root);
 // Existing folders are revalidated even if the form was opened before removal.
 await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);await open();await folder().selectOption(stale);await url().fill(site+'/stale');await page.evaluate(id=>chrome.bookmarks.removeTree(id),stale);await page.locator('dialog button[type=submit]').click();await expect(page.locator('#bookmark-folder-error')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);
 await edit();await folder().selectOption(fixture.root);await submit();assert.equal((await rows()).length,2);assert.equal((await page.evaluate(id=>chrome.bookmarks.getChildren(id),fixture.root)).filter(r=>r.url).length,1);
 await open();await url().fill(site+'/double');const before=(await rows()).length;await page.locator('.bookmark-form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});await expect(page.locator('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Новая закладка',exact:true})).toBeEnabled();assert.equal((await rows()).length,before+1);assert.equal((await rows()).at(-1).title,'Captured Page');
 await edit();await expect(page.getByLabel('Создать эскиз сайта',{exact:true})).toHaveCount(0);await page.screenshot({path:resolve(out,'edit-1920.png')});await title().fill('Draft');await page.locator('dialog .close').click();await expect(page.locator('dialog')).toHaveCount(0);assert.equal((await rows()).at(-1).title,'Captured Page');
 await page.getByRole('button',{name:'Настройки',exact:true}).click();
 await expect(page.locator('.settings')).toBeVisible();
 await expect(page.getByLabel('Скругление (px)',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();
 await expect(page.locator('.settings')).toHaveCount(0);
 await open();await expect(page.locator('.bookmark-dialog')).toHaveCSS('border-radius','24px');
 await expect(page.locator('.bookmark-dialog')).toHaveCSS('backdrop-filter','blur(12px) saturate(1.6)');
 await page.screenshot({path:resolve(out,'appearance-settings.png')});await page.locator('dialog .close').click();
 await expect(page.locator('dialog')).toHaveCount(0);
 assert.deepEqual(errors,[]);console.log('PASS Chrome bookmark dialogs: responsive layouts, validation, defaults, direct parent, capture titles, URL edits, explicit names, external same-name invalidation, cancellation, API/capture failures, stale folder, move');
}finally{await context.close();server.close();}
}
else server.close();
if (!process.argv.includes('--chrome-only')) {
const ffServer=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/favicon.ico'?'image/png':'text/html');res.end(req.url==='/favicon.ico'?icon:'<title>Actual local page</title><body>Firefox capture fixture</body>');});
await new Promise(r=>ffServer.listen(0,'127.0.0.1',r));const ffSite='http://127.0.0.1:'+ffServer.address().port;
const driver=await launchFirefox();
try{
 await driver.command('WebDriver:Navigate',{url:firefoxUrl});await driver.until('return !!document.querySelector(".add") || !!document.querySelector("button[aria-label=\\"Новая закладка\\"]");');
 await driver.exec('document.querySelector("button[aria-label=\\"Новая закладка\\"]").click();');await driver.until('return !!document.querySelector("#bookmark-url");');
 assert.equal(await driver.exec('return document.querySelector(".capture-option input").checked;'),true);
 assert.equal(await driver.exec('document.querySelector(".bookmark-form").requestSubmit();return document.querySelector("button[type=submit]").disabled && !document.querySelector("#bookmark-url-error");'),true);
 await driver.exec('const input=document.querySelector("#bookmark-url");input.value="https://firefox.example/";input.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector(".capture-option input").click();document.querySelector(".bookmark-form").requestSubmit();');await driver.until('return !document.querySelector("dialog");');await driver.until('return document.querySelectorAll(".bookmark").length===1;');
 const saved=await driver.exec('const root=(await browser.storage.local.get("rootFolderId")).rootFolderId;return (await browser.bookmarks.getChildren(root)).filter(row=>row.url);');assert.equal(saved[0].title,'firefox.example');
 await driver.exec('document.querySelector(".bookmark").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:30,clientY:100}));');
 await driver.exec('Array.from(document.querySelectorAll("button")).find(e=>e.textContent.trim()==="Изменить закладку").click();');await driver.until('return !!document.querySelector("#bookmark-title");');
 await driver.exec('const url=document.querySelector("#bookmark-url");url.value=arguments[0];url.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector(".bookmark-form").requestSubmit();',ffSite+'/changed');
 await driver.until('return !document.querySelector("dialog") && document.querySelector(".bookmark")?.textContent.includes("Actual local page");',30000);
 const shot=await driver.command('WebDriver:TakeScreenshot',{full:false});await writeFile(resolve(out,'firefox.png'),Buffer.from(shot,'base64'));
 console.log('PASS Firefox bookmark dialogs: default capture, inline validation, save without capture and domain fallback, URL edit, real capture and automatic page title');
}finally{await driver.close();ffServer.close();}


}
