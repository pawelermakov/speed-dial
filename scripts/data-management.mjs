import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchFirefox,firefoxUrl} from './firefox-driver.mjs';
import {openData,dataClick,chooseBackup,captureBackup,reopenData,selectSections,openExport} from './data-management-helpers.mjs';
const out=resolve('.browser-test/data-management');await mkdir(out,{recursive:true});
async function check(name,{exec,until,key,resize,shot}) {
 await until('return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;');
 await exec('window.api=globalThis.browser??chrome;window.errors=[];addEventListener("error",e=>errors.push(e.message));addEventListener("unhandledrejection",e=>errors.push(String(e.reason)));window.confirm=()=>{throw Error("System confirmation");};const {rootFolderId}=await api.storage.local.get("rootFolderId");window.source=(await api.bookmarks.create({parentId:rootFolderId,title:"Backup source"})).id;window.destination=(await api.bookmarks.create({parentId:rootFolderId,title:"Restore here"})).id;window.idA=(await api.bookmarks.create({parentId:source,title:"example.com",url:"https://example.com/"})).id;window.folderA=(await api.bookmarks.create({parentId:source,title:"Folder A"})).id;window.idB=(await api.bookmarks.create({parentId:folderA,title:"Duplicate",url:"https://example.com/"})).id;await api.bookmarks.create({parentId:source,title:"Empty folder"});window.testDB=await new Promise(resolve=>{const r=indexedDB.open("SpeedDialX");r.onsuccess=()=>resolve(r.result);});window.image=async color=>{const c=document.createElement("canvas");c.width=16;c.height=16;c.getContext("2d").fillStyle=color;c.getContext("2d").fillRect(0,0,16,16);return new Promise(r=>c.toBlob(r,"image/png"));};const red=await image("#ff0000"),blue=await image("#0000ff");await new Promise((resolve,reject)=>{const tx=testDB.transaction(["tileAssets","assets","autoNames"],"readwrite");tx.objectStore("tileAssets").put({bookmarkId:idA,url:"https://example.com/",thumbnail:red,favicon:red});tx.objectStore("tileAssets").put({bookmarkId:idB,url:"https://example.com/",thumbnail:blue});tx.objectStore("assets").put({key:"background",blob:blue});tx.objectStore("autoNames").put({bookmarkId:idA,url:"https://example.com/",token:"local-only"});tx.oncomplete=resolve;tx.onerror=reject;});await api.storage.local.set({rootFolderId:source});');
 await until('return document.querySelector(".folder-root")?.textContent.trim()==="Backup source";');
 await openData(exec,until);
 assert.equal(await exec('return document.querySelectorAll("dialog[open]").length;'),1);
 assert.equal(await exec('return !!document.querySelector(".settings");'),false);
 assert.equal(await exec('return document.querySelectorAll("textarea,.confirmation-dialog").length;'),0);
 const backup=await captureBackup(exec,until);
 await exec('window.duplicateFolders=[];const parent=(await api.bookmarks.get(source))[0].parentId;for(const title of ["Import target","Import target","Import target (2)"])duplicateFolders.push(await api.bookmarks.create({parentId:parent,title}));');
 await exec('window.bitmapOriginal=window.createImageBitmap;window.createImageBitmap=(...args)=>new Promise((resolve,reject)=>{window.releaseBitmap=()=>bitmapOriginal(...args).then(resolve,reject);});');
 await openExport(exec,until);
 assert.equal(await exec('return document.querySelector(".data-management h3").textContent.trim();'),'Будет экспортировано:');
 assert.equal(await exec('return [...document.querySelectorAll(".export-summary .backup-option")].every(label=>label.getBoundingClientRect().height>=44&&label.querySelector("input").labels.length);'),true);
 await exec('document.querySelector(".export-summary input").focus();');await key('Space');assert.equal(await exec('return document.querySelector(".export-summary input").checked;'),false);await key('Space');assert.equal(await exec('return document.querySelector(".export-summary input").checked;'),true);
 assert.deepEqual(await exec('return [...document.querySelectorAll(".export-summary .backup-detail")].map(e=>e.textContent.trim());'),['Закладки: 2 · Папки: 2','Эскизы: 2 · Иконки сайтов: 1']);
 await exec('window.afterPreview=(await api.bookmarks.create({parentId:source,title:"After preview",url:"https://after-preview.example/"})).id;');
 await dataClick(exec,'Экспортировать');await dataClick(exec,'Экспортировать');await until('return typeof releaseBitmap==="function"&&document.querySelector(".modal .close").disabled;');await key('Escape');assert.equal(await exec('return !!document.querySelector(".data-management");'),true);
 await exec('window.createImageBitmap=bitmapOriginal;releaseBitmap();');await until('return document.querySelector(".data-management [role=status]")?.textContent.includes("запущено");');assert.equal(await exec('return document.querySelector(".data-result h3").textContent.trim();'),'Экспорт завершён');assert.equal(await exec('return document.querySelector(".data-result [role=status] .sr-only").textContent.includes("Экспортировано изображений: 3");'),true);assert.equal(await exec('return JSON.parse(await (await fetch(backupDownload.url)).text()).entries.some(row=>row.title==="After preview");'),false);await exec('await api.bookmarks.remove(afterPreview);');await shot(name+'-export-result');await reopenData(exec,until);

 assert.equal(backup.version,3);assert.deepEqual(backup.entries.map(e=>e.title),['example.com','Folder A','Empty folder']);assert.ok(backup.entries[0].autoName);assert.notEqual(backup.entries[0].thumbnail,backup.entries[1].children[0].thumbnail);assert.ok(backup.background);assert.ok(!JSON.stringify(backup).includes('local-only'));assert.match(await exec('return backupDownload.name;'),/^speed-dial-backup-.*.json$/);
 await chooseBackup(exec,{...backup,version:99});await until('return document.querySelector(".data-management [role=alert]")?.textContent.includes("версии 3");');assert.equal(await exec('return (await api.bookmarks.getChildren(destination)).length;'),0);
 await chooseBackup(exec,{...backup,background:'data:image/png;base64,PHN2Zy8+'});await until('return document.querySelector(".data-management [role=alert]")?.textContent.includes("растровому");');
 await chooseBackup(exec,backup,'complete-backup.json');await until('return !!document.querySelector("#import-destination");');
 assert.equal(await exec('return document.querySelector(".data-management h3").textContent.trim();'),'Будет импортировано:');
 assert.deepEqual(await exec('return [...document.querySelectorAll(".import-summary .backup-option>span")].map(e=>e.firstChild.textContent.trim());'),['Закладки и папки','Изображения закладок','Настройки','Фон']);
 assert.equal(await exec('return document.querySelectorAll(".import-summary input:checked").length;'),4);
 assert.deepEqual(await exec('return duplicateFolders.map(row=>[...document.querySelector("#import-destination").options].find(option=>option.value===row.id).textContent.split(" / ").at(-1));'),['Import target','Import target (3)','Import target (2)']);
 await resize(320,800);assert.equal(await exec('return document.querySelector(".data-management").closest("dialog").scrollWidth<=innerWidth;'),true);assert.equal(await exec('const modal=document.querySelector(".modal");return modal.scrollWidth<=modal.clientWidth;'),true);await shot(name+'-import-preview-320');

 assert.equal(await exec('return document.querySelector(".data-management").textContent.includes("Браузер может синхронизировать изменения");'),false);
 await dataClick(exec,'Назад');assert.equal(await exec('return (await api.bookmarks.getChildren(destination)).length;'),0);
 for(const theme of ['light','dark'])for(const width of [320,360,1280]){
  await exec('const {settings}=await api.storage.local.get("settings");await api.storage.local.set({settings:{value:{...(settings?.value??arguments[1]),theme:arguments[0]}}});',theme,backup.settings);await until('return document.documentElement.dataset.theme==='+JSON.stringify(theme)+';');await resize(width,800);await shot(name+'-'+theme+'-'+width+'-home');
  assert.equal(await exec('const d=document.querySelector(".data-management").closest("dialog");return d.scrollWidth<=innerWidth&&[...d.querySelectorAll("button")].every(e=>e.getBoundingClientRect().right<=innerWidth);'),true);
  await dataClick(exec,'Сбросить настройки и кэш');assert.equal(await exec('return !document.querySelector(".confirmation-dialog")&&!!document.querySelector(".data-management");'),true);await shot(name+'-'+theme+'-'+width+'-reset');await dataClick(exec,'Отмена');
 }
 await chooseBackup(exec,backup);await until('return !!document.querySelector("#import-destination");');await exec('const e=document.querySelector("#import-destination");e.value=destination;e.dispatchEvent(new Event("change",{bubbles:true}));');
 await shot(name+'-import');await dataClick(exec,'Импортировать');await until('return document.querySelector(".data-management [role=status]")?.textContent.includes("Добавлено закладок: 2. Добавлено папок: 2");');
 assert.equal(await exec('return !document.querySelector(".data-management [role=alert]");'),true);
 await until('return document.activeElement?.textContent.trim()==="Готово";');
 assert.deepEqual(await exec('return [...document.querySelectorAll(".result-stats dd")].map(e=>Number(e.textContent));'),[2,2,3]);await shot(name+'-import-result');
 assert.equal(await exec('const rows=await api.bookmarks.getChildren(destination);const a=rows[0],b=(await api.bookmarks.getChildren(rows[1].id))[0];const get=(id)=>new Promise(r=>{const q=testDB.transaction("tileAssets").objectStore("tileAssets").get([id,"https://example.com/"]);q.onsuccess=()=>r(q.result);});const x=await get(a.id),y=await get(b.id);return a.id!==idA&&b.id!==idB&&String(new Uint8Array(await x.thumbnail.arrayBuffer()))!==String(new Uint8Array(await y.thumbnail.arrayBuffer()));'),true);

 await exec('window.beforeRepeat=JSON.stringify((await api.bookmarks.getSubTree(destination))[0]);await new Promise((resolve,reject)=>{const tx=testDB.transaction("tileAssets","readwrite");tx.objectStore("tileAssets").clear();tx.oncomplete=resolve;tx.onerror=reject;});');
 await reopenData(exec,until);await chooseBackup(exec,backup);await until('return !!document.querySelector("#import-destination");');await exec('const e=document.querySelector("#import-destination");e.value=destination;e.dispatchEvent(new Event("change",{bubbles:true}));');await dataClick(exec,'Импортировать');
 await until('return document.querySelector(".data-management [role=status]")?.textContent.includes("Восстановлено изображений: 3. Настройки и фон применены.");');
 assert.deepEqual(await exec('return [...document.querySelectorAll(".result-stats div")].map(e=>e.textContent.trim());'),['Изображения3']);
 assert.equal(await exec('return document.querySelector(".data-management [role=status]").textContent.includes(": 0");'),false);
 assert.equal(await exec('return JSON.stringify((await api.bookmarks.getSubTree(destination))[0])===beforeRepeat;'),true);
 await exec('window.restoredRows=await new Promise(r=>{const q=testDB.transaction("tileAssets").objectStore("tileAssets").getAll();q.onsuccess=()=>r(q.result);});');assert.equal(await exec('return restoredRows.length;'),2);
 await exec('await api.storage.local.set({rootFolderId:destination});');await until('return document.querySelector(".folder-root")?.textContent.trim()==="Restore here";');
 await reopenData(exec,until);await openExport(exec,until);await selectSections(exec,[]);
 assert.equal(await exec('return [...document.querySelectorAll(".data-management button")].find(e=>e.textContent.trim()==="Экспортировать").disabled;'),true);
 await selectSections(exec,['Изображения закладок']);await resize(320,800);await shot(name+'-export-images-320');
 await exec('backupDownload=null;');await dataClick(exec,'Экспортировать');await until('return !!backupDownload&&document.querySelector(".data-management [role=status]")?.textContent.includes("запущено");');
 const imagesOnly=await exec('return JSON.parse(await (await fetch(backupDownload.url)).text());');assert.equal(imagesOnly.bookmarks,false);assert.equal(Object.hasOwn(imagesOnly,'settings'),false);assert.equal(Object.hasOwn(imagesOnly,'background'),false);assert.ok(imagesOnly.entries.length);
 await exec('await api.storage.local.set({rootFolderId:source});');await until('return document.querySelector(".folder-root")?.textContent.trim()==="Backup source";');
 await reopenData(exec,until);await chooseBackup(exec,imagesOnly);await until('return !!document.querySelector("#import-destination");');
 assert.deepEqual(await exec('return [...document.querySelectorAll(".backup-option input")].map(e=>({checked:e.checked,disabled:e.disabled}));'),[{checked:false,disabled:true},{checked:true,disabled:false},{checked:false,disabled:true},{checked:false,disabled:true}]);
 await selectSections(exec,[]);assert.equal(await exec('return [...document.querySelectorAll(".data-management button")].find(e=>e.textContent.trim()==="Импортировать").disabled;'),true);await selectSections(exec,['Изображения закладок']);
 await exec('const e=document.querySelector("#import-destination");e.value=destination;e.dispatchEvent(new Event("change",{bubbles:true}));');await shot(name+'-import-images-320');await dataClick(exec,'Импортировать');await until('return !!document.querySelector(".data-result");');
 assert.deepEqual(await exec('return [...document.querySelectorAll(".result-stats div")].map(e=>e.textContent.trim());'),['Изображения3']);assert.equal(await exec('return document.querySelector(".data-result").textContent.includes("Настройки и фон применены");'),false);assert.equal(await exec('return JSON.stringify((await api.bookmarks.getSubTree(destination))[0])===beforeRepeat;'),true);
 await reopenData(exec,until);await chooseBackup(exec,backup);await until('return !!document.querySelector(".import-summary");');await selectSections(exec,['Закладки и папки']);await exec('const e=document.querySelector("#import-destination");e.value=destination;e.dispatchEvent(new Event("change",{bubbles:true}));');await dataClick(exec,'Импортировать');await until('return document.querySelector(".data-result")?.textContent.includes("Новых данных нет.");');assert.equal(await exec('return !!document.querySelector(".result-stats");'),false);
 await reopenData(exec,until);await openExport(exec,until);await selectSections(exec,['Настройки']);await exec('backupDownload=null;');await dataClick(exec,'Экспортировать');await until('return !!backupDownload&&document.querySelector(".data-management [role=status]")?.textContent.includes("запущено");');
 const settingsOnly=await exec('return JSON.parse(await (await fetch(backupDownload.url)).text());');assert.equal(settingsOnly.bookmarks,false);assert.deepEqual(settingsOnly.entries,[]);assert.equal(Object.hasOwn(settingsOnly,'background'),false);assert.ok(settingsOnly.settings);
 await reopenData(exec,until);await chooseBackup(exec,settingsOnly);await until('return !!document.querySelector(".import-summary");');assert.equal(await exec('return !!document.querySelector("#import-destination");'),false);await dataClick(exec,'Импортировать');await until('return document.querySelector(".data-result [role=status]")?.textContent.includes("Настройки применены.");');assert.equal(await exec('return !!document.querySelector(".result-stats");'),false);
 await reopenData(exec,until);await chooseBackup(exec,{...backup,entries:[{title:'Partial saved',url:'https://partial.example/'},{title:'Stop here',url:'https://stop.example/'}]});await until('return !!document.querySelector("#import-destination");');assert.equal(await exec('return document.querySelector("#import-destination").value;'),await exec('return source;'));await exec('const e=document.querySelector("#import-destination");e.value=destination;e.dispatchEvent(new Event("change",{bubbles:true}));');
 await exec('window.originalCreate=api.bookmarks.create;api.bookmarks.create=async input=>{if(input.title==="Stop here")throw Error("Controlled partial import");return originalCreate.call(api.bookmarks,input);};');
 await dataClick(exec,'Импортировать');await until('return document.querySelector(".data-management [role=alert]")?.textContent.includes("Controlled partial import");');assert.ok((await exec('return document.querySelector(".data-management [role=status]").textContent;')).includes('Добавлено закладок: 1.'));assert.deepEqual(await exec('return [...document.querySelectorAll(".result-stats div")].map(e=>e.textContent.trim());'),['Закладки1']);assert.equal(await exec('return document.querySelector(".data-management [role=status]").textContent.includes("Настройки и фон применены");'),false);await exec('api.bookmarks.create=originalCreate;');
 for(const theme of ['light','dark'])for(const width of [320,360,1280]){
  await exec('const {settings}=await api.storage.local.get("settings");await api.storage.local.set({settings:{value:{...settings.value,theme:arguments[0]}}});',theme);await until('return document.documentElement.dataset.theme==='+JSON.stringify(theme)+';');await resize(width,800);
  assert.equal(await exec('const d=document.querySelector(".data-result").closest("dialog");return d.scrollWidth<=innerWidth;'),true);await shot(name+'-'+theme+'-'+width+'-partial-result');
 }

 await key('Escape');await until('return !document.querySelector(".data-management");');await until('return document.activeElement?.matches(".settings-trigger");');
 await openData(exec,until);await dataClick(exec,'Сбросить настройки и кэш');await key('Escape');await until('return !document.querySelector(".data-management");');assert.equal(await exec('return await new Promise(r=>{const q=testDB.transaction("tileAssets").objectStore("tileAssets").count();q.onsuccess=()=>r(q.result);});'),2);
 await openData(exec,until);await dataClick(exec,'Сбросить настройки и кэш');await dataClick(exec,'Сбросить');await until('return document.querySelector(".data-management [role=status]")?.textContent.includes("Закладки и выбранная папка сохранены");');
 await shot(name+'-reset-result');await until('return document.activeElement?.textContent.trim()==="Готово";');
 assert.equal(await exec('return (await api.bookmarks.getChildren(destination)).length;'),4);assert.equal(await exec('return (await api.storage.local.get("rootFolderId")).rootFolderId;'),await exec('return source;'));
 assert.equal(await exec('return await new Promise(r=>{const q=testDB.transaction("tileAssets").objectStore("tileAssets").count();q.onsuccess=()=>r(q.result);});'),0);
 await dataClick(exec,'Готово');await until('return !document.querySelector(".data-management");');await until('return document.activeElement?.matches(".settings-trigger");');await openData(exec,until);
 assert.deepEqual(await exec('return errors;'),[]);console.log('PASS '+name+': complete/selected backup sections, settings-only and image-only transfer, empty-selection guard, repeat import restores images without duplicate bookmarks/folders, duplicate-URL images/new IDs, version rejection, decode rejection, cancel, busy/double-click/Escape, partial import, explicit destination, embedded reset, focus, themes and 320/360/1280');return backup;
}

async function waitFor(exec,body){const start=Date.now();while(!await exec(body)){if(Date.now()-start>15000)throw Error(body+' '+JSON.stringify(await exec('return {active:document.activeElement?.tagName,message:document.querySelector(".data-management")?.textContent};')));await new Promise(r=>setTimeout(r,100));}}
if(!process.argv.includes('--firefox-only')) {
 const extension=resolve('.output/chrome-mv3'),options={channel:'chromium',headless:true,colorScheme:'light',args:['--disable-extensions-except='+extension,'--load-extension='+extension]};let backup;
 const ctx=await chromium.launchPersistentContext(resolve('.browser-test/data-chrome-'+crypto.randomUUID()),options);
 try{
  const worker=ctx.serviceWorkers()[0]??await ctx.waitForEvent('serviceworker'),page=await ctx.newPage();await page.goto(worker.url().replace('background.js','newtab.html'));
  const exec=(body,...args)=>page.evaluate(new Function('args','return (async function(){'+body+'}).apply(null,args)'),args),until=body=>waitFor(exec,body);
  backup=await check('chrome',{exec,until,key:value=>page.keyboard.press(value),resize:(width,height)=>page.setViewportSize({width,height}),shot:label=>page.screenshot({path:resolve(out,label+'.png')})});
  await exec('HTMLAnchorElement.prototype.click=backupOriginalClick;');const event=page.waitForEvent('download');await page.getByRole('button',{name:'Экспорт',exact:true}).click();await page.getByRole('button',{name:'Экспортировать',exact:true}).click();const download=await event;assert.match(download.suggestedFilename(),/^speed-dial-backup-.*[.]json$/);const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.equal(JSON.parse(Buffer.concat(chunks).toString()).version,3);await download.delete();
  console.log('PASS chrome: native JSON download and filename');
 }finally{await ctx.close();}
 const fresh=await chromium.launchPersistentContext(resolve('.browser-test/data-fresh-'+crypto.randomUUID()),options);
 try{
  const worker=fresh.serviceWorkers()[0]??await fresh.waitForEvent('serviceworker'),page=await fresh.newPage();await page.goto(worker.url().replace('background.js','newtab.html'));
  const exec=(body,...args)=>page.evaluate(new Function('args','return (async function(){'+body+'}).apply(null,args)'),args),until=body=>waitFor(exec,body);
  await until('return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;');await openData(exec,until);
  await page.locator('.data-management input[type=file]').setInputFiles({name:'complete-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.getByRole('button',{name:'Импортировать',exact:true}).click();await until('return document.querySelector(".data-management [role=status]")?.textContent.includes("Добавлено закладок: 2. Добавлено папок: 2");');assert.equal(await exec('return !!document.querySelector(".data-management [role=alert]");'),false);
  assert.equal(await exec('const api=globalThis.browser??chrome,root=(await api.storage.local.get("rootFolderId")).rootFolderId,rows=await api.bookmarks.getChildren(root);return rows.some(e=>e.title==="example.com")&&rows.some(e=>e.title==="Folder A");'),true);
  await page.screenshot({path:resolve(out,'chrome-fresh-profile.png')});console.log('PASS chrome: complete backup restored through native file input in a clean browser profile');
 }finally{await fresh.close();}
}
if(!process.argv.includes('--chrome-only')) {
 const ff=await launchFirefox();
 try{await ff.command('WebDriver:Navigate',{url:firefoxUrl});await check('firefox',{...ff,key:async value=>{const code={Escape:'\uE00C',Tab:'\uE004',Enter:'\uE006',Space:' '}[value]??value;await ff.command('WebDriver:PerformActions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:code},{type:'keyUp',value:code}]}]});},resize:(width,height)=>ff.command('WebDriver:SetWindowRect',{width,height}),shot:async label=>writeFile(resolve(out,label+'.png'),Buffer.from(await ff.command('WebDriver:TakeScreenshot',{}),'base64'))});}finally{await ff.close();}
}
