import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchFirefox,firefoxUrl} from './firefox-driver.mjs';
const out=resolve('.browser-test/settings-autosave');await mkdir(out,{recursive:true});
const image=await readFile('public/images/icon128.png');
const ext=resolve('.output/chrome-mv3');
if(!process.argv.includes('--firefox-only')) {
const context=await chromium.launchPersistentContext(resolve('.browser-test/settings-autosave-'+crypto.randomUUID()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
try{
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const url=worker.url().replace('background.js','newtab.html');
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 await page.addInitScript(()=>{window.mutations=[];for(const key of ['create','update','move','remove','removeTree']){const original=chrome.bookmarks[key];chrome.bookmarks[key]=(...args)=>{window.mutations.push(key);return original.apply(chrome.bookmarks,args);};}});
 await page.goto(url);await expect(page.getByRole('button',{name:'Настройки',exact:true})).toBeEnabled();
 const fixture=await page.evaluate(async()=>{const {rootFolderId}=await chrome.storage.local.get('rootFolderId');const other=await chrome.bookmarks.create({parentId:rootFolderId,title:'Another source'});const a=await chrome.bookmarks.create({parentId:rootFolderId,title:'Folder A'}),b=await chrome.bookmarks.create({parentId:rootFolderId,title:'Folder B'});await chrome.bookmarks.create({parentId:a.id,title:'A tile',url:'https://a.example/'});await chrome.bookmarks.create({parentId:b.id,title:'B tile',url:'https://b.example/'});return{root:rootFolderId,other:other.id,a:a.id,b:b.id};});
 const open=async target=>{const button=target.getByRole('button',{name:'Настройки',exact:true});await expect(button).toBeEnabled();await button.focus();await button.press('Enter');await expect(target.getByLabel('Папка закладок',{exact:true})).toBeEnabled();};
 const close=async target=>{await target.getByRole('button',{name:'Закрыть настройки',exact:true}).click();await expect(target.locator('.settings')).toHaveCount(0);};
 const stored=(target,key)=>target.evaluate(async key=>(await chrome.storage.local.get('settings')).settings?.value[key],key);
 await open(page);await expect(page.locator('.settings').getByRole('button',{name:'Сохранить',exact:true})).toHaveCount(0);
 await page.getByLabel('Ширина (%)',{exact:true}).fill('80');await expect.poll(()=>stored(page,'width')).toBe(80);
 await expect(page.getByLabel('Ширина (%)',{exact:true})).toBeFocused();
 await page.getByLabel('Ширина (%)',{exact:true}).fill('');await expect(page.getByLabel('Ширина (%)',{exact:true})).toHaveAttribute('aria-invalid','true');assert.equal(await stored(page,'width'),80);
 await page.getByLabel('Ширина (%)',{exact:true}).fill('85');await close(page);assert.equal(await stored(page,'width'),85);
 const peer=await context.newPage();await peer.goto(url);await open(peer);await open(page);
 await Promise.all([page.getByLabel('Ширина (%)',{exact:true}).fill('70'),peer.getByLabel('Расстояние (px)',{exact:true}).fill('12'),peer.locator('.search select').selectOption('imdb')]);
 await page.getByLabel('Ширина (%)',{exact:true}).blur();await peer.getByLabel('Расстояние (px)',{exact:true}).blur();
 await expect.poll(()=>stored(page,'width')).toBe(70);await expect.poll(()=>stored(page,'space')).toBe(12);await expect.poll(()=>stored(page,'searchProvider')).toBe('imdb');
 await expect(page.getByLabel('Расстояние (px)',{exact:true})).toHaveValue('12');
 await close(peer);await peer.close();
 await page.evaluate(()=>{const original=chrome.storage.local.set;window.restoreSet=()=>chrome.storage.local.set=original;chrome.storage.local.set=(value,...args)=>value.settings?Promise.reject(new Error('settings write failed')):original.call(chrome.storage.local,value,...args);});
 await page.getByLabel('Ширина (%)',{exact:true}).fill('75');await page.getByLabel('Ширина (%)',{exact:true}).blur();await expect(page.locator('.settings [role=alert]')).toContainText('Ширина');
 await close(page);await expect(page.locator('[role=alert]')).toContainText('settings write failed');assert.equal(await stored(page,'width'),70);
 await page.evaluate(()=>window.restoreSet());await open(page);await page.getByLabel('Ширина (%)',{exact:true}).fill('90');await page.getByLabel('Ширина (%)',{exact:true}).blur();await expect.poll(()=>stored(page,'width')).toBe(90);
 await page.getByLabel('Изменить фон',{exact:true}).setInputFiles({name:'background.png',mimeType:'image/png',buffer:image});await expect(page.getByRole('button',{name:'Удалить фон',exact:true})).toBeVisible();await close(page);
 await expect.poll(()=>page.locator('.page-background').evaluate(e=>e.style.backgroundImage)).toContain('blob:');const background=await page.locator('.page-background').evaluate(e=>e.style.backgroundImage);
 await page.evaluate(()=>{window.mutations=[];});
 for(const name of ['Folder B','Folder A','Folder B','Folder A']){await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');assert.equal(await page.locator('.page-background').evaluate(e=>e.style.backgroundImage),background);}
 await page.evaluate(id=>{const original=chrome.bookmarks.getChildren;window.restoreChildren=()=>chrome.bookmarks.getChildren=original;window.delayedRead=false;chrome.bookmarks.getChildren=async requested=>{if(requested===id){window.delayedRead=true;await new Promise(resolve=>setTimeout(resolve,150));}return original.call(chrome.bookmarks,requested);};},fixture.a);
 await page.getByRole('button',{name:'Folder A',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.delayedRead)).toBe(true);
 await page.getByRole('button',{name:'Folder B',exact:true}).click();await expect(page.getByRole('button',{name:'Folder B',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.bookmark')).toHaveAttribute('href','https://b.example/');await page.evaluate(()=>window.restoreChildren());
 await open(page);const source=page.getByLabel('Папка закладок',{exact:true});
 for(const id of [fixture.other,fixture.root,fixture.other,fixture.root]){await source.selectOption(id);await expect.poll(()=>page.evaluate(async()=> (await chrome.storage.local.get('rootFolderId')).rootFolderId)).toBe(id);}
 await page.evaluate(({root,other})=>{const select=document.querySelector('#bookmark-folder');for(const id of [other,root,other,root]){select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));}},fixture);
 await expect(source).toHaveValue(fixture.root);await expect.poll(()=>page.evaluate(async()=> (await chrome.storage.local.get('rootFolderId')).rootFolderId)).toBe(fixture.root);
 assert.equal(await page.locator('.page-background').evaluate(e=>e.style.backgroundImage),background);assert.deepEqual(await page.evaluate(()=>window.mutations),[]);
 await page.evaluate(()=>{chrome.permissions.contains=async()=>true;chrome.identity.getProfileUserInfo=async()=>({id:'',email:''});});
 await close(page);await open(page);await expect(page.locator('[data-icon=circle-x]')).toBeVisible();await page.getByRole('button',{name:'О синхронизации',exact:true}).hover();await expect(page.locator('#sync-info')).toBeVisible();await expect(page.locator('#sync-info')).toContainText('«Расширения» и «Закладки»');await page.getByRole('heading',{name:'Настройки',exact:true}).hover();await expect(page.locator('#sync-info')).toBeHidden();
 await page.evaluate(()=>{chrome.identity.getProfileUserInfo=async()=>({id:'test-only',email:'private@example.invalid'});});await close(page);await open(page);await expect(page.locator('[data-icon=circle-check]')).toBeVisible();await expect(page.locator('.sync-email')).toHaveText('private@example.invalid');
 await page.evaluate(()=>{chrome.identity.getProfileUserInfo=async()=>{throw Error('denied');};});await close(page);await open(page);await expect(page.locator('[data-icon=circle-help]')).toBeVisible();await expect(page.locator('.sync-email')).toHaveText('Аккаунт недоступен');
 for(const width of [360,1280,1920]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('.settings').evaluate(e=>e.scrollWidth<=e.clientWidth),true);await page.locator('.settings').screenshot({path:resolve(out,'settings-'+width+'.png')});}
 await page.getByRole('button',{name:'Удалить фон',exact:true}).click();await expect.poll(()=>page.locator('.page-background').evaluate(e=>e.style.backgroundImage)).toBe('');await close(page);await page.reload();await open(page);await expect(page.getByLabel('Ширина (%)',{exact:true})).toHaveValue('90');assert.deepEqual(errors,[]);
 const preferences=await page.evaluate(async()=> (await chrome.storage.local.get('settings')).settings.value);
 await page.getByLabel('Ширина (%)',{exact:true}).fill('88');await page.getByRole('button',{name:'Импорт',exact:true}).click();
 await page.locator('dialog textarea').fill(JSON.stringify({version:2,entries:[],settings:{...preferences,width:67,space:9}}));await page.getByRole('button',{name:'Импортировать',exact:true}).click();
 await expect(page.locator('dialog')).toHaveCount(0);await expect.poll(()=>stored(page,'width')).toBe(67);
 await open(page);await page.getByLabel('Ширина (%)',{exact:true}).fill('89');await page.getByRole('button',{name:'Сбросить настройки и кэш',exact:true}).click();
 await expect(page.locator('.settings')).toHaveCount(0);await expect.poll(()=>stored(page,'width')).toBe(100);assert.equal(await stored(page,'space'),24);assert.equal(await page.evaluate(async()=> (await chrome.storage.local.get('rootFolderId')).rootFolderId),fixture.root);
 assert.deepEqual(await page.evaluate(()=>window.mutations),[]);
 console.log('PASS Chrome settings: autosave, invalid input, close flush, two tabs, provider patch, failure rollback/persistent alert, stable background across folders/sources, zero bookmark writes, Sync states, responsive panels, reload, pending edits cannot overwrite import/reset');
}finally{await context.close();}
}
if(!process.argv.includes('--chrome-only')) {
const driver=await launchFirefox();try{
 await driver.command('WebDriver:Navigate',{url:firefoxUrl});await driver.until('return !!document.querySelector(".page")&&!document.querySelector("button[aria-label=Настройки]").disabled;');
 await driver.exec('document.querySelector("button[aria-label=Настройки]").click();');await driver.until('return !!document.querySelector("#bookmark-folder")&&!document.querySelector("#bookmark-folder").disabled;');
 assert.equal(await driver.exec('return Array.from(document.querySelectorAll(".settings button")).some(e=>e.textContent.trim()==="Сохранить");'),false);
 await driver.exec('const input=document.querySelector("input[aria-label=\\"Ширина (%)\\"]");input.value="75";input.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("button[aria-label=\\"Закрыть настройки\\"]").click();');
 await driver.until('return !document.querySelector(".settings");');assert.equal(await driver.exec('return (await browser.storage.local.get("settings")).settings.value.width;'),75);
 await driver.exec('document.querySelector("button[aria-label=Настройки]").click();');await driver.until('return !!document.querySelector("[data-icon=circle-help]");');
 await driver.until('return document.querySelector(".settings").getBoundingClientRect().right<=innerWidth+1 && document.getAnimations().every(animation=>animation.playState!=="running");');
 await driver.exec('await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);');
 await driver.exec('const input=document.querySelector("#background");const data=new DataTransfer();data.items.add(new File([Uint8Array.from(arguments[0])],"background.png",{type:"image/png"}));input.files=data.files;input.dispatchEvent(new Event("change",{bubbles:true}));',Array.from(image));
 await driver.until('return !!document.querySelector(".page-background").style.backgroundImage;');
 const background=await driver.exec('return document.querySelector(".page-background").style.backgroundImage;');
 const ids=await driver.exec('const root=(await browser.storage.local.get("rootFolderId")).rootFolderId;const a=await browser.bookmarks.create({parentId:root,title:"Firefox A"}),b=await browser.bookmarks.create({parentId:root,title:"Firefox B"});return[a.id,b.id];');
 await driver.exec('document.querySelector("button[aria-label=\\"Закрыть настройки\\"]").click();');await driver.until('return !document.querySelector(".settings");');
 for(const id of ids){await driver.until('return !!document.querySelector("nav button[aria-pressed]");');await driver.exec('const name=arguments[0];Array.from(document.querySelectorAll("nav button")).find(e=>e.textContent.trim()===name).click();',id===ids[0]?'Firefox A':'Firefox B');await driver.until('return Array.from(document.querySelectorAll("nav button[aria-pressed=true]")).some(e=>e.textContent.trim()==="'+(id===ids[0]?'Firefox A':'Firefox B')+'");');assert.equal(await driver.exec('return document.querySelector(".page-background").style.backgroundImage;'),background);}
 await driver.exec('document.querySelector("button[aria-label=Настройки]").click();');await driver.until('return !!document.querySelector("[data-icon=circle-help]");');
 const screenshot=await driver.command('WebDriver:TakeScreenshot',{full:false});await writeFile(resolve(out,'settings-firefox.png'),Buffer.from(screenshot,'base64'));
 console.log('PASS Firefox settings: autosave close flush, unavailable account status and native Sync, real background upload, stable folder background');
}finally{await driver.close();}

}
