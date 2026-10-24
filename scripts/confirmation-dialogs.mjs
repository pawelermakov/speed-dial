import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { launchFirefox, firefoxUrl } from './firefox-driver.mjs';

async function check(name,{exec,until,key,resize,shot,hover}) {
 await until('return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;');
 await exec('window.api=globalThis.browser??chrome;window.errors=[];addEventListener("error",e=>errors.push(e.message));window.confirm=()=>{throw Error("Unexpected system confirmation");};const {rootFolderId}=await api.storage.local.get("rootFolderId");window.parityRoot=(await api.bookmarks.create({parentId:rootFolderId,title:"Confirmation test"})).id;window.target=(await api.bookmarks.create({parentId:parityRoot,title:"Delete me",url:"https://example.com/"})).id;window.folder=(await api.bookmarks.create({parentId:parityRoot,title:"Folder to delete"})).id;const deep=await api.bookmarks.create({parentId:folder,title:"Hidden"});window.descendant=(await api.bookmarks.create({parentId:deep.id,title:"Nested",url:"https://nested.example/"})).id;await api.storage.local.set({rootFolderId:parityRoot});');
 await until('return document.querySelector(".folder-root")?.textContent.trim()==="Confirmation test"&&document.querySelectorAll(".bookmark").length===1;');
 const menuDelete=async(selector,label)=>{await exec('const e=document.querySelector(arguments[0]);e.focus();e.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:100,clientY:150}));',selector);await until('return document.activeElement?.getAttribute("role")==="menuitem"&&!document.activeElement.closest("[inert]");');await exec('[...document.querySelectorAll("[role=menuitem]")].find(e=>e.textContent.trim()===arguments[0]).click();',label);await until('return !!document.querySelector(".confirmation-dialog")&&document.activeElement.textContent.trim()==="Отмена"&&!document.querySelector(".modal-panel-enter-active");');};
 const close=()=>until('return !document.querySelector(".confirmation-dialog");');
 const confirm=()=>exec('document.querySelector(".confirmation-dialog button.danger").click();');
 for(const width of [360,1280,1920]) {
  await resize(width,800);await exec('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));');await menuDelete('.bookmark','Удалить закладку');
  assert.equal(await exec('const d=document.querySelector(".confirmation-dialog"),r=d.querySelector(".modal").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&d.scrollWidth<=innerWidth&&getComputedStyle(d.querySelector(".modal")).borderRadius==="24px"&&!!document.getElementById(d.getAttribute("aria-describedby"));'),true);
  assert.equal(await exec('const primary=getComputedStyle(document.querySelector(".confirmation-dialog button.danger")),secondary=getComputedStyle(document.querySelector(".confirmation-dialog button[autofocus]"));return primary.backgroundColor!==secondary.backgroundColor&&secondary.backgroundColor==="rgb(255, 204, 0)"&&primary.color!==secondary.color;'),true,'safe default uses the app accent and destructive text stays distinct');
  await key('Tab');assert.equal(await exec('return document.activeElement.classList.contains("danger");'),true);
  await key('Tab');await key('Tab');assert.equal(await exec('return document.activeElement.textContent.trim();'),'Отмена','Tab stays inside the confirmation');
  if(shot)await shot(width);
  const color=await exec('return getComputedStyle(document.querySelector(".confirmation-dialog button.danger")).color;');
  await hover('.confirmation-dialog button.danger');await exec('await new Promise(r=>setTimeout(r,200));');
  assert.deepEqual(await exec('const s=getComputedStyle(document.querySelector(".confirmation-dialog button.danger"));return [s.color,s.backgroundColor];'),[color,'rgba(255, 255, 255, 0.58)'],'hover keeps destructive text readable on the shared input surface');
  if(shot)await shot(width+'-hover');
  await hover('.confirmation-dialog .panel-header');
  await key('Enter');await close();assert.equal(await exec('return document.querySelectorAll(".bookmark").length;'),1);
  await until('return document.activeElement?.dataset.bookmarkId===target;');
 }
 await menuDelete('.bookmark','Удалить закладку');await key('Escape');await close();
 await menuDelete('.bookmark','Удалить закладку');await exec('document.querySelector(".confirmation-dialog .close").click();');await close();
 await menuDelete('.bookmark','Удалить закладку');await exec('document.querySelector(".confirmation-dialog").click();');await close();
 await exec('window.originalRemove=api.bookmarks.remove;api.bookmarks.remove=async()=>{throw Error("Controlled delete failure");};');
 await menuDelete('.bookmark','Удалить закладку');await confirm();await until('return document.querySelector(".confirmation-dialog [role=alert]")?.textContent.includes("Controlled delete failure");');
 assert.equal(await exec('return document.querySelectorAll(".bookmark").length;'),1);await key('Escape');await close();
 await exec('window.removeCalls=[];api.bookmarks.remove=id=>{removeCalls.push(id);return new Promise((resolve,reject)=>{window.releaseDelete=()=>originalRemove.call(api.bookmarks,id).then(resolve,reject);});};');
 await menuDelete('.bookmark','Удалить закладку');await exec('const e=document.querySelector(".confirmation-dialog button.danger");e.click();e.click();');await until('return typeof releaseDelete==="function"&&[...document.querySelectorAll(".confirmation-dialog button")].every(e=>e.disabled);');
 await key('Escape');assert.equal(await exec('return !!document.querySelector(".confirmation-dialog");'),true);assert.equal(await exec('return removeCalls.length;'),1);
 await exec('releaseDelete();');await close();await until('return !document.querySelector(".bookmark");');await exec('api.bookmarks.remove=originalRemove;');
 await menuDelete('.folder-tab','Удалить папку');assert.equal(await exec('return document.querySelector(".confirmation-dialog").textContent.includes("скрытые вложенные папки");'),true);await confirm();await close();
 assert.equal(await exec('try{await api.bookmarks.get(descendant);return true;}catch{return false;}'),false);
 await exec('await api.bookmarks.create({parentId:parityRoot,title:"Keep bookmark",url:"https://keep.example/"});await api.storage.local.set({settings:{value:{width:70}}});document.querySelector(".settings-trigger").click();');await until('return !!document.querySelector(".settings");');
 const reset=async()=>{await exec('const e=[...document.querySelectorAll(".settings button")].find(e=>e.textContent.trim()==="Сбросить настройки и кэш");e.focus();e.click();');await until('return !!document.querySelector(".confirmation-dialog");');};
 await reset();await key('Escape');await close();assert.equal(await exec('return !!document.querySelector(".settings")&&document.activeElement.textContent.trim()==="Сбросить настройки и кэш";'),true);
 assert.equal(await exec('return (await api.storage.local.get("settings")).settings.value.width;'),70);
 await reset();assert.equal(await exec('return document.querySelector(".confirmation-dialog button.danger").textContent.trim();'),'Сбросить');await confirm();await close();await until('return !document.querySelector(".settings")');assert.equal(await exec('return (await api.bookmarks.getChildren(parityRoot)).filter(e=>e.url).length;'),1);
 await exec('document.querySelector(".settings-trigger").click();');await until('return !!document.querySelector(".settings");');await exec('[...document.querySelectorAll(".settings button")].find(e=>e.textContent.trim()==="Импорт").click();');await until('return !!document.querySelector(".transfer-form");');
 const importText=JSON.stringify({version:2,entries:[{title:'Imported',url:'https://import.example/'}],settings:{width:65},background:null});
 await exec('const e=document.querySelector("textarea");e.value=arguments[0];e.dispatchEvent(new Event("input",{bubbles:true}));',importText);
 const importConfirm=async()=>{await exec('const e=document.querySelector(".transfer-form button");e.focus();document.querySelector(".transfer-form").requestSubmit();');await until('return !!document.querySelector(".confirmation-dialog")&&document.activeElement.textContent.trim()==="Отмена";');};
 await importConfirm();await key('Escape');await close();assert.equal(await exec('return document.querySelector("textarea").value;'),importText);assert.equal(await exec('return document.activeElement.textContent.trim();'),'Импортировать');
 await importConfirm();await exec('window.changedRoot=(await api.bookmarks.create({parentId:parityRoot,title:"Changed destination"})).id;await api.storage.local.set({rootFolderId:changedRoot});');await until('return document.querySelector(".folder-root")?.textContent.trim()==="Changed destination";');
 await exec('document.querySelector(".confirmation-dialog button:not(.secondary):not(.close)").click();');await until('return document.querySelector(".confirmation-dialog [role=alert]")?.textContent.includes("Папка назначения изменилась");');assert.equal(await exec('return (await api.bookmarks.getChildren(changedRoot)).length;'),0);await key('Escape');await close();await key('Escape');await until('return !document.querySelector("dialog");');
 assert.deepEqual(await exec('return errors;'),[]);
 console.log('PASS '+name+': native-style confirmations, Cancel default/Enter/Escape/close/backdrop, focus/Tab, 360/1280/1920, inline failure, busy/double-click, descendant deletion, nested settings/reset preserves bookmarks, import cancellation and destination change guard');
}

if(!process.argv.includes('--firefox-only')) {
 const extension=resolve('.output/chrome-mv3');
 const context=await chromium.launchPersistentContext(resolve('.browser-test/parity-chrome-'+crypto.randomUUID()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try {
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),page=await context.newPage();
  await page.goto(worker.url().replace('background.js','newtab.html'));
  const exec=(body,...args)=>page.evaluate(new Function('args','return (async function(){'+body+'}).apply(null,args)'),args);
  page.on('dialog',()=>{throw Error('Unexpected system dialog');});
  await check('chrome',{hover:selector=>page.locator(selector).hover(),shot:label=>page.screenshot({path:'.browser-test/confirmation-'+label+'.png'}),exec,reload:()=>page.reload(),until:async body=>{const start=Date.now();while(!await exec(body)){if(Date.now()-start>15000)throw Error(body+'; '+JSON.stringify(await exec('return {active:document.activeElement.outerHTML,text:document.body.innerText,errors:window.errors};')));await new Promise(r=>setTimeout(r,100));}},key:value=>page.keyboard.press(value),pointer:selector=>page.locator(selector).click(),resize:(width,height)=>page.setViewportSize({width,height})});
 }finally{await context.close();}
}
if(!process.argv.includes('--chrome-only')) {
 const ff=await launchFirefox();
 try {
  await ff.command('WebDriver:Navigate',{url:firefoxUrl});
  const codes={Escape:'\uE00C',Tab:'\uE004',ArrowDown:'\uE015',Enter:'\uE006'};
  await check('firefox',{...ff,hover:async selector=>{const point=await ff.exec('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:Math.floor(r.x+r.width/2),y:Math.floor(r.y+r.height/2)};',selector);await ff.command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',duration:0,...point}]}]});},reload:()=>ff.command('WebDriver:Refresh',{}),key:async value=>{const key=codes[value]??value;await ff.command('WebDriver:PerformActions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:key},{type:'keyUp',value:key}]}]});},pointer:async selector=>{const point=await ff.exec('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:Math.floor(r.x+r.width/2),y:Math.floor(r.y+r.height/2)};',selector);await ff.command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',duration:0,...point},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});},resize:(width,height)=>ff.command('WebDriver:SetWindowRect',{width,height})});
 }catch(error){console.error(await ff.exec('return {text:document.body.innerText,errors:window.parityErrors,stored:await browser.storage.local.get("rootFolderId"),children:window.parityRoot?(await browser.bookmarks.getChildren(parityRoot)).slice(0,6):[]};'));throw error;}finally{await ff.close();}
}
