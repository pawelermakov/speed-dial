import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { launchFirefox, firefoxUrl } from './firefox-driver.mjs';

async function check(name,{exec,until,key,resize,screenshot,media}) {
 await until('return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;');
 await exec(`window.api=globalThis.browser??globalThis.chrome;window.parityErrors=[];addEventListener('error',e=>parityErrors.push(e.message));addEventListener('unhandledrejection',e=>parityErrors.push(String(e.reason)));
 const {rootFolderId}=await api.storage.local.get('rootFolderId');window.parityRoot=(await api.bookmarks.create({parentId:rootFolderId,title:'Empty state'})).id;
 await api.storage.local.set({rootFolderId:parityRoot});`);
 await until('return !!document.querySelector(".bookmark-empty .empty-state")&&document.querySelector(".folder-root")?.textContent.trim()==="Empty state";');
 assert.equal(await exec('return document.querySelectorAll(".bookmark-empty button").length;'),1);
 for(const width of [360,1280,1920]) {
  await resize(width,800);
  for(const [kind,background] of [['light','#fff'],['dark','#000'],['pattern','repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0/32px 32px']]) {
   await exec('const e=document.querySelector(".page-background");e.style.opacity="1";e.style.background=arguments[0];',background);
   assert.equal(await exec('const e=document.querySelector(".bookmark-empty .empty-state"),r=e.getBoundingClientRect(),b=e.querySelector("button").getBoundingClientRect();return r.width<=441&&r.x>=0&&r.right<=innerWidth&&b.x>=r.x&&b.right<=r.right&&document.documentElement.scrollWidth<=innerWidth;'),true);
   assert.equal(await exec('return getComputedStyle(document.querySelector(".empty-state button")).aspectRatio;'),'auto');
   if(screenshot)await screenshot(name+'-'+width+'-'+kind);
  }
 }
 await exec('document.querySelector(".bookmark-empty button").focus();');await key('Enter');
 await until('return !!document.querySelector("#bookmark-url");');
 await key('Escape');await until('return !document.querySelector("dialog")&&document.activeElement.matches(".bookmark-empty button");');
 await exec('await api.bookmarks.create({parentId:parityRoot,title:"Example",url:"https://example.test/"});');
 await until('return document.querySelectorAll(".bookmark").length===1&&!document.querySelector(".bookmark-empty");');
 await exec('const e=document.querySelector(".search select");e.value="bookmarks";e.dispatchEvent(new Event("change",{bubbles:true}));const input=document.querySelector(".search input");input.value="not-found";input.dispatchEvent(new Event("input",{bubbles:true}));');
 await until('return !!document.querySelector(".bookmark-search-empty");');
 assert.equal(await exec('return document.querySelectorAll(".bookmark-empty").length;'),0);
 assert.equal(await exec('return document.querySelector(".bookmark-search-empty").getAttribute("role");'),'status');
 if(screenshot)await screenshot(name+'-no-results');
 await exec('document.querySelector(".bookmark-search-empty button").focus();');await key('Enter');
 await until('return !document.querySelector(".bookmark-search-empty")&&document.querySelectorAll(".bookmark").length===1&&document.activeElement===document.querySelector(".search input")&&document.activeElement.value==="";');
 assert.equal(await exec('return document.querySelector(".search select").value;'),'bookmarks');
 // System accessibility modes apply to the shared surface and action.
 await exec('await api.bookmarks.create({parentId:parityRoot,title:"Empty child"});');await until('return !!document.querySelector(".folder-tab");');await exec('document.querySelector(".folder-tab").click();');await until('return !!document.querySelector(".bookmark-empty");');
 if(media){await media({forcedColors:'active',reducedMotion:'reduce'});await key('Tab');await exec('document.querySelector(".empty-state button").focus();');assert.equal(await exec('return getComputedStyle(document.querySelector(".empty-state button")).outlineStyle;'),'solid');if(screenshot)await screenshot(name+'-forced-colors');}
 assert.deepEqual(await exec('return parityErrors;'),[]);
 console.log('PASS '+name+': empty folder and no-results hierarchy, responsive backgrounds, one action, keyboard dialog/clear and focus return');
}

if(!process.argv.includes('--firefox-only')) {
 const extension=resolve('.output/chrome-mv3');
 const context=await chromium.launchPersistentContext(resolve('.browser-test/parity-chrome-'+crypto.randomUUID()),{locale:'ru-RU',channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try {
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),page=await context.newPage();
  await page.goto(worker.url().replace('background.js','newtab.html'));
  const exec=(body,...args)=>page.evaluate(new Function('args','return (async function(){'+body+'}).apply(null,args)'),args);
  await check('chrome',{exec,until:async body=>{const start=Date.now();while(!await exec(body)){if(Date.now()-start>15000)throw Error(body);await new Promise(r=>setTimeout(r,100));}},key:value=>page.keyboard.press(value),pointer:selector=>page.locator(selector).click(),resize:(width,height)=>page.setViewportSize({width,height}),screenshot:name=>page.screenshot({path:resolve('.browser-test/empty-'+name+'.png'),animations:'disabled'}),media:value=>page.emulateMedia(value)});
 }finally{await context.close();}
}
if(!process.argv.includes('--chrome-only')) {
 const ff=await launchFirefox();
 try {
  await ff.command('WebDriver:Navigate',{url:firefoxUrl});
  const codes={Escape:'\uE00C',Tab:'\uE004',ArrowDown:'\uE015',Enter:'\uE006'};
  await check('firefox',{...ff,key:async value=>{const key=codes[value]??value;await ff.command('WebDriver:PerformActions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:key},{type:'keyUp',value:key}]}]});},pointer:async selector=>{const point=await ff.exec('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:Math.floor(r.x+r.width/2),y:Math.floor(r.y+r.height/2)};',selector);await ff.command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',duration:0,...point},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});},resize:(width,height)=>ff.command('WebDriver:SetWindowRect',{width,height})});
 }catch(error){console.error(await ff.exec('return {text:document.body.innerText,errors:window.parityErrors,stored:await browser.storage.local.get("rootFolderId"),children:window.parityRoot?(await browser.bookmarks.getChildren(parityRoot)).slice(0,6):[]};'));throw error;}finally{await ff.close();}
}
