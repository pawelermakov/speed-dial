import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { launchFirefox, firefoxUrl } from './firefox-driver.mjs';

async function check(name, {exec,until,key,resize}) {
 await until('return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;');
 await exec(`window.api=globalThis.browser??globalThis.chrome;window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
 const {rootFolderId}=await api.storage.local.get('rootFolderId');window.parityRoot=(await api.bookmarks.create({parentId:rootFolderId,title:'Keyboard'})).id;
 window.ids=[];for(let i=0;i<15;i++)ids.push((await api.bookmarks.create({parentId:parityRoot,title:'Key '+i,url:'https://key'+i+'.example/'})).id);
 window.folderIds=[];for(let i=0;i<3;i++)folderIds.push((await api.bookmarks.create({parentId:parityRoot,title:'Folder '+i})).id);
 await api.storage.local.set({rootFolderId:parityRoot});`);
 await until('return document.querySelectorAll(".bookmark").length===15;');
 const tabTo=async selector=>{for(let i=0;i<40;i++){if(await exec('return document.activeElement.matches(arguments[0]);',selector))return;await key('Tab');}throw Error('Cannot reach '+selector);};
 // Add, edit, sort and delete through keyboard-accessible UI controls.
 await exec('document.querySelector(".folder-root").focus();');await key('Shift+F10');await until('return document.activeElement?.getAttribute("role")==="menuitem";');await key('Enter');await until('return document.activeElement.id==="bookmark-url";');
 for(const char of 'https://keyboard.example/')await key(char);
 await key('Tab');for(const char of 'Keyboard CRUD')await key(char);
 await tabTo('[role=switch]');await key(' ');
 await tabTo('.bookmark-form button[type=submit]');await key('Tab');
 assert.equal(await exec('return document.activeElement.getAttribute("aria-label");'),'Закрыть');
 await key('Shift+Tab');assert.equal(await exec('return document.activeElement.matches(".bookmark-form button[type=submit]");'),true);await key('Enter');
 await until('return !document.querySelector("dialog")&&document.querySelectorAll(".bookmark").length===16;');
 await exec('window.crudId=[...document.querySelectorAll(".bookmark")].find(e=>e.href==="https://keyboard.example/").dataset.bookmarkId;document.querySelectorAll(".bookmark")[15].focus();');
 await key('Shift+F10');await until('return document.activeElement?.getAttribute("role")==="menuitem";');await key('ArrowDown');await key('Enter');await until('return document.activeElement.id==="bookmark-url";');
 await key('Tab');await key('End');await key('!');await key('Enter');
 await until('return !document.querySelector("dialog")&&document.activeElement?.dataset.bookmarkId===crudId;');
 assert.equal(await exec('return (await api.bookmarks.get(crudId))[0].title;'),'Keyboard CRUD!');
 await key('Shift+F10');await until('return document.activeElement?.getAttribute("role")==="menuitem";');await key('End');
 await key('Enter');await until('return !!document.querySelector(".confirmation-dialog");');await exec('document.querySelector(".confirmation-dialog button.danger").focus();');await key('Enter');await until('return document.querySelectorAll(".bookmark").length===15&&!document.querySelector("[role=menu]");');

 const focused=()=>exec('return document.activeElement?.dataset.bookmarkId;');
 for(const width of [360,1280,1920]) {
  await resize(width,800);
  await exec('await new Promise(r=>setTimeout(r,100));document.querySelector(".bookmark").focus();');
  const columns=await exec('return getComputedStyle(document.querySelector(".bookmarks")).gridTemplateColumns.split(" ").length;');
  await key('ArrowDown');assert.equal(await focused(),await exec('return ids[arguments[0]];',columns));
  await key('Home');assert.equal(await focused(),await exec('return ids[arguments[0]];',columns));
  await key('End');assert.equal(await focused(),await exec('return ids[Math.min(arguments[0]*2-1,14)];',columns));
 }
 await exec('document.querySelector(".bookmark").focus();');
 assert.equal(await exec('const before=document.activeElement;before.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true,isComposing:true}));before.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true,ctrlKey:true}));return document.activeElement===before;'),true);
 await exec('document.documentElement.dataset.linkActivations="0";document.activeElement.addEventListener("click",e=>{e.preventDefault();document.documentElement.dataset.linkActivations="1";},{once:true});');await key('Enter');await until('return document.documentElement.dataset.linkActivations==="1";');
 await key('Shift+F10');
 await until('return document.activeElement?.getAttribute("role")==="menuitem";');
 assert.equal(await exec('return [...document.querySelectorAll("[role=menuitem]")].find(e=>e.textContent==="Переместить влево").disabled;'),true);
 // First item -> edit -> thumbnail -> move right (disabled left is skipped).
 await key('ArrowDown');await key('ArrowDown');await key('ArrowDown');await key('Enter');
 await until('return document.querySelector(".bookmark")?.dataset.bookmarkId===ids[1] && !document.querySelector("[role=menu]");');
 assert.equal(await focused(),await exec('return ids[0];'));
 assert.deepEqual(await exec('return (await api.bookmarks.getChildren(parityRoot)).filter(e=>e.url).slice(0,2).map(e=>e.id);'),await exec('return [ids[1],ids[0]];'));
 // Escape and Tab close menus and return to the same tile.
 for(const closeKey of ['Escape','Tab']) {await key('Shift+F10');await until('return document.activeElement?.getAttribute("role")==="menuitem";');await key(closeKey);await until('return !document.querySelector("[role=menu]");');assert.equal(await focused(),await exec('return ids[0];'));}
 // Open edit with real keyboard input; Escape must discard its draft.
 await key('Shift+F10');await until('return document.activeElement?.getAttribute("role")==="menuitem";');await key('ArrowDown');await key('Enter');
 await until('return !!document.querySelector("dialog");');await key('Tab');assert.equal(await exec('return !!document.activeElement.closest("dialog");'),true);
 await key('Escape');await until('return !document.querySelector("dialog") && document.activeElement?.dataset.bookmarkId===ids[0];');
 // External deletion of the focused tile selects its nearest surviving neighbor.
 await exec('await api.bookmarks.remove(ids[0]);');
 await until('return document.querySelectorAll(".bookmark").length===14;');
 await until('return document.activeElement?.dataset.bookmarkId===ids[2];');
 await exec('document.querySelector(".folder-tab").focus();');await key('Shift+F10');await until('return document.activeElement?.getAttribute("role")==="menuitem";');
 await key('ArrowDown');await key('Enter');
 await until('return document.querySelector(".folder-tab")?.dataset.folderId===folderIds[1]&&!document.querySelector("[role=menu]");');
 assert.equal(await exec('return document.activeElement.dataset.folderId;'),await exec('return folderIds[0];'));
 await exec('await api.bookmarks.removeTree(folderIds[0]);');await until('return document.activeElement?.dataset.folderId===folderIds[2];');
 // The virtual root exposes creation, never rename/delete or sorting.
 await exec('document.querySelector(".folder-root").focus();');await key('Shift+F10');await until('return document.activeElement?.getAttribute("role")==="menuitem";');
 assert.equal(await exec('return [...document.querySelectorAll("[role=menuitem]")].some(e=>/Удалить|Изменить|Переместить/.test(e.textContent));'),false);
 await key('ArrowDown');await key('Enter');await until('return !!document.querySelector("#folder-name");');
 await key('Escape');await until('return !document.querySelector("dialog");');
 await key('/');await until('return document.activeElement?.getAttribute("aria-label")==="Поиск по закладкам";');
 await exec('const e=document.activeElement;e.value="Key 2";e.dispatchEvent(new Event("input",{bubbles:true}));');await until('return document.querySelectorAll(".bookmark").length===1;');
 await exec('document.querySelector(".bookmark").focus();');await key('Shift+F10');await until('return !!document.querySelector("[role=menu]");');
 assert.equal(await exec('return [...document.querySelectorAll("[role=menuitem]")].filter(e=>e.textContent.startsWith("Переместить")).every(e=>e.disabled);'),true);
 await key('Escape');await key('Escape');await until('return document.querySelector(".search input").value === "";');
 await exec('document.querySelector(".bookmark").focus();for(const node of await api.bookmarks.getChildren(parityRoot))if(node.url)await api.bookmarks.remove(node.id);');
 await until('return document.querySelectorAll(".bookmark").length===0 && document.activeElement.matches(".add-card");');
 assert.deepEqual(await exec('return errors;'),[]);
 console.log('PASS '+name+': keyboard CRUD, responsive grid, native Enter, IME/shortcut isolation, menus, sorting, modal Tab cycle, external deletion and search');
}

if(!process.argv.includes('--firefox-only')) {
 const extension=resolve('.output/chrome-mv3');
 const context=await chromium.launchPersistentContext(resolve('.browser-test/parity-chrome-'+crypto.randomUUID()),{locale:'ru-RU',channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try {
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),page=await context.newPage();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(worker.url().replace('background.js','newtab.html'));
  const exec=(body,...args)=>page.evaluate(new Function('args','return (async function(){'+body+'}).apply(null,args)'),args);
  await check('chrome',{exec,until:async body=>{const start=Date.now();while(!await exec(body)){if(Date.now()-start>15000)throw Error(body);await new Promise(r=>setTimeout(r,100));}},key:value=>page.keyboard.press(value),pointer:selector=>page.locator(selector).click(),resize:(width,height)=>page.setViewportSize({width,height})});
 }finally{await context.close();}
}
if(!process.argv.includes('--chrome-only')) {
 const ff=await launchFirefox();
 try {
  await ff.command('WebDriver:Navigate',{url:firefoxUrl});
  const codes={Escape:'\uE00C',Tab:'\uE004',ArrowDown:'\uE015',ArrowUp:'\uE013',Home:'\uE011',End:'\uE010',Enter:'\uE006',F10:'\uE03A'};
  await check('firefox',{...ff,key:async value=>{const shift=value.startsWith('Shift+');const k=codes[value.replace('Shift+','')]??value;const actions=[...(shift?[{type:'keyDown',value:'\uE008'}]:[]),{type:'keyDown',value:k},{type:'keyUp',value:k},...(shift?[{type:'keyUp',value:'\uE008'}]:[])];await ff.command('WebDriver:PerformActions',{actions:[{type:'key',id:'keyboard',actions}]});},pointer:async selector=>{const point=await ff.exec('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:Math.floor(r.x+r.width/2),y:Math.floor(r.y+r.height/2)};',selector);await ff.command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',duration:0,...point},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});},resize:(width,height)=>ff.command('WebDriver:SetWindowRect',{width,height})});
 }catch(error){console.error(await ff.exec('return {text:document.body.innerText,errors:window.errors,active:document.activeElement.outerHTML,stored:await browser.storage.local.get("rootFolderId"),children:window.parityRoot?(await browser.bookmarks.getChildren(parityRoot)).slice(0,6):[]};'));throw error;}finally{await ff.close();}
}
