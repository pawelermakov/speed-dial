import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { launchFirefox, firefoxUrl } from './firefox-driver.mjs';

async function check(name,{exec,until,key,resize}) {
 await until('return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;');
 await exec('window.api=globalThis.browser??chrome;const {rootFolderId}=await api.storage.local.get("rootFolderId");window.parityRoot=(await api.bookmarks.create({parentId:rootFolderId,title:"Center test"})).id;window.child=(await api.bookmarks.create({parentId:parityRoot,title:"Empty"})).id;await api.bookmarks.create({parentId:parityRoot,title:"Example",url:"https://example.com/"});await api.storage.local.set({rootFolderId:parityRoot});');
 await until('return document.querySelector(".folder-root")?.textContent.trim()==="Center test"&&document.querySelectorAll(".bookmark").length===1;');
 const center=async()=>{await exec('document.querySelector(".settings-trigger").click();');await until('return !!document.querySelector(".settings");');await exec('[...document.querySelectorAll(".switch-control")].find(e=>e.textContent.trim()==="Центрировать по вертикали").querySelector("input").click();');await key('Escape');await until('return !document.querySelector("dialog");');};
 const geometry=()=>exec('const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {search:rect(".search"),tools:rect(".tools"),folders:rect(".bookmark-toolbar"),content:rect(".bookmark-content"),grid:rect(".bookmarks"),scroll:document.documentElement.scrollHeight,viewport:innerHeight};');
 for(const width of [360,1280,1920]) {
  await resize(width,900);await exec('scrollTo(0,0);');const before=await geometry();
  await center();await until('return document.querySelector(".bookmark-content").classList.contains("justify-center");');const after=await geometry();
  for(const control of ['search','tools','folders'])assert.ok(Math.abs(before[control].top-after[control].top)<1,control+' must stay in place');
  assert.ok(Math.abs((after.grid.top+after.grid.bottom)/2-(after.content.top+after.content.bottom)/2)<2,'grid centered in remaining area');
  assert.ok(after.grid.top>before.grid.top+20,'grid should move');
  await center();await until('return !document.querySelector(".bookmark-content").classList.contains("justify-center");');
 }
 await center();await exec('document.querySelector(".folder-tab").click();');await until('return !!document.querySelector(".bookmark-empty");');
 let g=await geometry();assert.ok(Math.abs((g.grid.top+g.grid.bottom)/2-(g.content.top+g.content.bottom)/2)<2,'empty state centered');
 await exec('document.querySelector(".folder-root").click();');await until('return document.querySelectorAll(".bookmark").length===1;');
 await resize(360,500);await exec('for(let i=0;i<40;i++)await api.bookmarks.create({parentId:parityRoot,title:"Item "+i,url:"https://example.com/"+i});');
 await until('return document.querySelectorAll(".bookmark").length===41;');
 g=await geometry();assert.ok(g.scroll<=g.viewport,'page must stay within viewport');assert.equal(await exec('const e=document.querySelector(".bookmark-content");return e.scrollHeight>e.clientHeight;'),true,'long grid must scroll inside its container');assert.ok(g.grid.top>=g.folders.bottom-1,'first row must remain below folders');
 await exec('document.querySelector(".bookmark:last-of-type").focus();');assert.equal(await exec('const r=document.activeElement.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;'),true,'last item remains reachable');
 await exec('document.querySelector(".folder-tab").click();');await until('return !!document.querySelector(".bookmark-empty");');assert.equal(await exec('return document.querySelector(".bookmark-content").scrollTop;'),0,'switching folders resets the bookmark scroll');
 await exec('document.querySelector(".folder-root").click();');await until('return document.querySelectorAll(".bookmark").length===41;');assert.equal(await exec('return document.querySelector(".bookmark-content").scrollTop;'),0);
 await exec('await api.bookmarks.removeTree(child);');await until('return !document.querySelector(".folder-tab");');
 assert.equal(await exec('return document.querySelector(".bookmarks").getBoundingClientRect().top>=document.querySelector("header").getBoundingClientRect().bottom;'),true);
 console.log('PASS '+name+': only grid moves, stable header/folders, empty state, 360/1280/1920, long-grid scrolling and no child folders');
}

if(!process.argv.includes('--firefox-only')) {
 const extension=resolve('.output/chrome-mv3');
 const context=await chromium.launchPersistentContext(resolve('.browser-test/parity-chrome-'+crypto.randomUUID()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try {
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),page=await context.newPage();
  await page.goto(worker.url().replace('background.js','newtab.html'));
  const exec=(body,...args)=>page.evaluate(new Function('args','return (async function(){'+body+'}).apply(null,args)'),args);
  await check('chrome',{exec,reload:()=>page.reload(),until:async body=>{const start=Date.now();while(!await exec(body)){if(Date.now()-start>15000)throw Error(body);await new Promise(r=>setTimeout(r,100));}},key:value=>page.keyboard.press(value),pointer:selector=>page.locator(selector).click(),resize:(width,height)=>page.setViewportSize({width,height})});
 }finally{await context.close();}
}
if(!process.argv.includes('--chrome-only')) {
 const ff=await launchFirefox();
 try {
  await ff.command('WebDriver:Navigate',{url:firefoxUrl});
  const codes={Escape:'\uE00C',Tab:'\uE004',ArrowDown:'\uE015',Enter:'\uE006'};
  await check('firefox',{...ff,reload:()=>ff.command('WebDriver:Refresh',{}),key:async value=>{const key=codes[value]??value;await ff.command('WebDriver:PerformActions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:key},{type:'keyUp',value:key}]}]});},pointer:async selector=>{const point=await ff.exec('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:Math.floor(r.x+r.width/2),y:Math.floor(r.y+r.height/2)};',selector);await ff.command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',duration:0,...point},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});},resize:(width,height)=>ff.command('WebDriver:SetWindowRect',{width,height})});
 }catch(error){console.error(await ff.exec('return {text:document.body.innerText,errors:window.parityErrors,stored:await browser.storage.local.get("rootFolderId"),children:window.parityRoot?(await browser.bookmarks.getChildren(parityRoot)).slice(0,6):[]};'));throw error;}finally{await ff.close();}
}
