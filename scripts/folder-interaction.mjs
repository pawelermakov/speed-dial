import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchFirefox,firefoxUrl} from './firefox-driver.mjs';
const out=resolve('.browser-test/folders');await mkdir(out,{recursive:true});
const ext=resolve('.output/chrome-mv3');
if(!process.argv.includes('--firefox-only')) {
const context=await chromium.launchPersistentContext(resolve(out,crypto.randomUUID()),{locale:'ru-RU',channel:'chromium',headless:true,args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
try{
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',()=>{throw Error('Unexpected system dialog');});
 await page.goto(worker.url().replace('background.js','newtab.html'));
 await expect(page.locator('.folder-root')).toBeVisible();await expect(page.getByLabel('Новая папка',{exact:true})).toHaveCount(0);
 const data=await page.evaluate(async()=>{
  const {rootFolderId}=await chrome.storage.local.get('rootFolderId');const root=await chrome.bookmarks.create({parentId:rootFolderId,title:'Работа'});await chrome.storage.local.set({rootFolderId:root.id});return{root:root.id};
 });
 const children=()=>page.evaluate(id=>chrome.bookmarks.getChildren(id),data.root);
 await expect(page.locator('.folder-root')).toHaveText('Работа');await expect(page.locator('.bookmark')).toHaveCount(0);
 const fixture=await page.evaluate(async root=>{
  const a=await chrome.bookmarks.create({parentId:root,title:'First',url:'https://first.example/'});
  const folder=await chrome.bookmarks.create({parentId:root,title:'Работа'});
  const b=await chrome.bookmarks.create({parentId:root,title:'Second',url:'https://second.example/'});
  const c=await chrome.bookmarks.create({parentId:root,title:'Third',url:'https://third.example/'});
  const f2=await chrome.bookmarks.create({parentId:root,title:'Главная'});
  const deep=await chrome.bookmarks.create({parentId:folder.id,title:'Hidden folder'});await chrome.bookmarks.create({parentId:deep.id,title:'Hidden',url:'https://hidden.example/'});
  return{a:a.id,b:b.id,c:c.id,folder:folder.id,f2:f2.id,deep:deep.id};
 },data.root);
 await expect(page.getByRole('button',{name:'Работа (папка)',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Главная',exact:true})).toBeVisible();await expect(page.locator('.bookmark')).toHaveCount(3);
 const first=page.locator('.bookmark').first(),last=page.locator('.bookmark').last();
 await first.dragTo(last,{targetPosition:{x:(await last.boundingBox()).width-2,y:20}});

 await expect.poll(async()=>(await children()).filter(row=>row.url).map(row=>row.id)).toEqual([fixture.b,fixture.c,fixture.a]);
 assert.equal((await children())[1].id,fixture.folder);
 await page.reload();await expect(page.locator('.bookmark')).toHaveCount(3);await expect(page.locator('.bookmark').first()).toHaveAttribute('href','https://second.example/');
 // A partial native move failure leaves the UI on the actual tree.
 await page.evaluate(()=>{const move=chrome.bookmarks.move;let count=0;window.restoreMove=()=>chrome.bookmarks.move=move;chrome.bookmarks.move=(...args)=>{if(++count===2)return Promise.reject(Error('folders partial move fixture'));return move(...args);};});
 await page.locator('.bookmark').first().dragTo(page.locator('.bookmark').last(),{targetPosition:{x:(await page.locator('.bookmark').last().boundingBox()).width-2,y:20}});
 await expect(page.locator('.notice')).toContainText('folders partial move fixture');
 const actual=(await children()).filter(row=>row.url).map(row=>row.url);
 await expect.poll(()=>page.locator('.bookmark').evaluateAll(links=>links.map(el=>el.href))).toEqual(actual);
 await page.evaluate(()=>window.restoreMove());await page.getByLabel('Закрыть уведомление',{exact:true}).click();
 // An external edit cancels a pending drag before drop.
 await page.locator('.bookmark').first().evaluate(el=>{window.dragTarget=el;window.testTransfer=new DataTransfer();el.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.testTransfer}));});
 await page.evaluate(id=>chrome.bookmarks.update(id,{title:'External update during drag'}),fixture.c);
 await expect(page.locator('.bookmark.dragging')).toHaveCount(0);
 const external=await children();await page.locator('.bookmark').last().evaluate(el=>el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.testTransfer})));assert.deepEqual(await children(),external);
 // Self drop and a tile drop on a folder are inert.
 const before=await children();await page.locator('.bookmark').first().evaluate(el=>{const dt=new DataTransfer();el.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));el.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}));});await page.locator('.bookmark').first().dragTo(page.getByRole('button',{name:'Главная',exact:true}));assert.deepEqual(await children(),before);
 const plus={click:async()=>{await page.locator('.folder-root').click({button:'right'});await page.getByRole('menuitem',{name:'Новая папка',exact:true}).click();}};await plus.click();const draft=page.getByRole('textbox',{name:'Название папки',exact:true});await draft.fill('Cancelled');await draft.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);assert.deepEqual(await children(),before);
 await plus.click();const createButton=page.getByRole('button',{name:'Создать',exact:true});await expect(createButton).toBeDisabled();await draft.fill('   ');await expect(createButton).toBeDisabled();await draft.fill('Created');await expect(createButton).toBeEnabled();await draft.clear();await expect(createButton).toBeDisabled();await draft.fill('Created');await draft.press('Enter');const created=page.getByRole('button',{name:'Created',exact:true});await expect(created).toHaveAttribute('aria-pressed','true');await expect(page.locator('.bookmark')).toHaveCount(0);
 await created.click({button:'right'});await page.getByRole('menuitem',{name:'Изменить папку',exact:true}).click();const rename=page.getByRole('textbox',{name:'Название папки',exact:true});await rename.fill('Renamed');await rename.press('Enter');const renamed=page.getByRole('button',{name:'Renamed',exact:true});await expect(renamed).toBeVisible();
 await renamed.dragTo(page.getByRole('button',{name:'Работа (папка)',exact:true}),{targetPosition:{x:2,y:10}});
 await expect.poll(async()=>(await children()).filter(row=>!row.url).map(row=>row.title)).toEqual(['Renamed','Работа','Главная']);
 await renamed.click({button:'right'});await page.getByRole('menuitem',{name:'Удалить папку',exact:true}).click();await page.locator('.confirmation-dialog').getByRole('button',{name:'Отмена',exact:true}).click();await expect(page.locator('.confirmation-dialog')).toHaveCount(0);await expect(renamed).toBeVisible();
 const renamedId=(await children()).find(row=>row.title==='Renamed').id;
 const descendant=await page.evaluate(async parent=>{const folder=await chrome.bookmarks.create({parentId:parent,title:'Deep'});return (await chrome.bookmarks.create({parentId:folder.id,title:'Nested',url:'https://nested.example/'})).id;},renamedId);
 await expect(renamed).toBeEnabled();await renamed.click({button:'right'});await page.getByRole('menuitem',{name:'Удалить папку',exact:true}).click();await page.locator('.confirmation-dialog').getByRole('button',{name:'Удалить',exact:true}).click();await expect(page.locator('.confirmation-dialog')).toHaveCount(0);await expect(renamed).toHaveCount(0);
 assert.equal(await page.evaluate(async id=>{try{await chrome.bookmarks.get(id);return true;}catch{return false;}},descendant),false);
 await page.locator('.folder-root').click({button:'right'});await expect(page.getByRole('menuitem',{name:'Удалить папку',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Главная',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'Изменить папку',exact:true}).click();const blurName=page.getByRole('textbox',{name:'Название папки',exact:true});await blurName.fill('Blur saved');await blurName.press('Enter');await expect(page.getByRole('button',{name:'Blur saved',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Работа (папка)',exact:true}).click();await page.evaluate(id=>chrome.bookmarks.move(id,{parentId:'1'}),fixture.folder);await expect(page.locator('.folder-root')).toHaveAttribute('aria-pressed','true');
 await page.evaluate(id=>chrome.bookmarks.update(id,{title:'Очень длинное название выбранной папки для проверки расположения'}),data.root);
 await expect(page.locator('.folder-root')).toHaveAttribute('title','Очень длинное название выбранной папки для проверки расположения');
 await page.evaluate(async root=>{for(let i=0;i<24;i++)await chrome.bookmarks.create({parentId:root,title:'Папка '+i});},data.root);
 for(const width of [360,1280,1920]){
  await page.setViewportSize({width,height:900});await expect(page.getByRole('button',{name:'Папка 23',exact:true})).toBeAttached();
  assert.equal(await page.locator('.folder-scroll').evaluate(e=>e.scrollWidth>e.clientWidth),true);
  for(const selector of ['.folder-scroll','.search']){const r=await page.locator(selector).boundingBox();assert(r&&r.x>=0&&r.x+r.width<=width);}
  assert.equal(await page.locator('html').evaluate(e=>e.scrollWidth<=innerWidth),true);
  for(const scrollbar of ['none','auto']){
   const style=await page.addStyleTag({content:'.folder-scroll {scrollbar-width:'+scrollbar+'!important}.folder-scroll::-webkit-scrollbar {height:16px}'});
   const folder=await page.locator('.folder-root').boundingBox();assert.equal(folder.height,48);await style.evaluate(e=>e.remove());
  }
  await plus.click();
  const modal=page.getByRole('dialog');
  const field=page.getByRole('textbox',{name:'Название папки',exact:true});
  await field.fill('Очень длинное название новой папки');
  const box=await modal.locator('.modal').boundingBox();assert(box.x>=0&&box.x+box.width<=width);
  await expect(modal.getByRole('button',{name:'Создать',exact:true})).toBeVisible();
  await modal.getByRole('button',{name:'Закрыть',exact:true}).click();await expect(modal).toHaveCount(0);
  await page.locator('.bookmark-toolbar').screenshot({path:resolve(out,'folders-'+width+'.png')});
 }
 const scroll=await page.locator('.folder-scroll').evaluate(e=>e.scrollLeft=80);const top=(await page.locator('.bookmarks').boundingBox()).y;
 await page.locator('.search select').selectOption('bookmarks');await page.getByRole('searchbox').fill('example');await expect(page.locator('.bookmark')).toHaveCount(3);await expect(page.locator('.bookmark').first()).toHaveAttribute('draggable','false');
 await page.getByRole('searchbox').press('Escape');await expect(page.getByRole('searchbox')).toHaveValue('');await expect(page.locator('.folder-tabs')).toBeVisible();assert.equal((await page.locator('.bookmarks').boundingBox()).y,top);assert.equal(await page.locator('.folder-scroll').evaluate(e=>e.scrollLeft),scroll);
 await page.getByRole('button',{name:'Настройки',exact:true}).evaluate(e=>e.click());
 await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();
 await plus.click();
 await expect(page.locator('.modal')).toHaveCSS('border-top-left-radius','24px');
 await expect(page.locator('.modal')).toHaveCSS('backdrop-filter','blur(12px) saturate(1.6)');
 await expect(page.getByRole('textbox',{name:'Название папки',exact:true})).toHaveCSS('border-top-left-radius','10px');
 const tokens=await page.locator('.modal').evaluate(el=>{const s=getComputedStyle(el);return {accent:s.getPropertyValue('--ui-accent').trim(),background:s.backgroundColor};});
 assert.equal(tokens.accent.toUpperCase(),'#FC0');assert.equal(tokens.background,'rgba(255, 255, 255, 0.54)');
 await expect(page.getByRole('dialog')).toHaveCSS('opacity','1');
 await page.getByRole('dialog').screenshot({path:resolve(out,'folder-modal-appearance.png')});
 await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
 assert.deepEqual(errors,[]);console.log('PASS Chrome folders: persistent root/name/icon, folder modal create/rename/cancel/delete protection, real tile/folder DnD, mixed slots, ignored self/cross-folder drops, native events, responsive scrolling and search layout');
}finally{await context.close();}
}
if(!process.argv.includes('--chrome-only')){
 const driver=await launchFirefox();try{
  await driver.command('WebDriver:Navigate',{url:firefoxUrl});await driver.until('return !!document.querySelector(".folder-root");');
  await driver.exec('const {rootFolderId}=await browser.storage.local.get("rootFolderId");window.testRoot=(await browser.bookmarks.create({parentId:rootFolderId,title:"Firefox root"})).id;await browser.storage.local.set({rootFolderId:window.testRoot});');
  await driver.until('return document.querySelector(".folder-root")?.textContent.trim()==="Firefox root";');
  await driver.exec('window.testIds=[];for(let i=0;i<3;i++)window.testIds.push((await browser.bookmarks.create({parentId:window.testRoot,title:"Link "+i,url:"https://ff"+i+".example/"})).id);window.testFolder=(await browser.bookmarks.create({parentId:window.testRoot,title:"Folder"})).id;');
  await driver.until('return document.querySelectorAll(".bookmark").length===3;');
  await driver.exec('const links=document.querySelectorAll(".bookmark"),dt=new DataTransfer();links[0].dispatchEvent(new DragEvent("dragstart",{bubbles:true,dataTransfer:dt}));const r=links[2].getBoundingClientRect();links[2].dispatchEvent(new DragEvent("dragover",{bubbles:true,cancelable:true,clientX:r.right-2,dataTransfer:dt}));links[2].dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,clientX:r.right-2,dataTransfer:dt}));links[0].dispatchEvent(new DragEvent("dragend",{bubbles:true,dataTransfer:dt}));');
  await driver.until('return (await browser.bookmarks.getChildren(window.testRoot)).filter(e=>e.url).map(e=>e.id).join() === [window.testIds[1],window.testIds[2],window.testIds[0]].join();');
  await driver.exec('document.querySelector(".folder-root").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}));');await driver.until('return !!document.querySelector("[role=menu]");');await driver.exec('Array.from(document.querySelectorAll("[role=menuitem]")).find(e=>e.textContent==="Новая папка").click();');await driver.until('return !!document.querySelector("#folder-name");');
  await driver.exec('const el=document.querySelector("#folder-name");el.value="New folder";el.dispatchEvent(new Event("input",{bubbles:true}));el.closest("form").requestSubmit();');
  await driver.until('return document.querySelector(".folder-tab[aria-pressed=true]")?.textContent.trim()==="New folder";');
  await driver.exec('const tabs=document.querySelectorAll(".folder-tab"),dt=new DataTransfer();tabs[1].dispatchEvent(new DragEvent("dragstart",{bubbles:true,dataTransfer:dt}));const r=tabs[0].getBoundingClientRect();tabs[0].dispatchEvent(new DragEvent("dragover",{bubbles:true,cancelable:true,clientX:r.left+2,dataTransfer:dt}));tabs[0].dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,clientX:r.left+2,dataTransfer:dt}));tabs[1].dispatchEvent(new DragEvent("dragend",{bubbles:true,dataTransfer:dt}));');
  await driver.until('return (await browser.bookmarks.getChildren(window.testRoot)).filter(e=>!e.url)[0].title==="New folder";');
  const shot=await driver.command('WebDriver:TakeScreenshot',{full:false});await writeFile(resolve(out,'firefox.png'),Buffer.from(shot,'base64'));
  console.log('PASS Firefox folders: root title, native API tile/folder sorting via HTML5 event path and selected newly created folder');
 }finally{await driver.close();}
}
