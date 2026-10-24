import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {launchFirefox,firefoxUrl} from './firefox-driver.mjs';
async function check(name,{exec,until,key,resize}){
 await until('return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;');
 await exec('window.api=globalThis.browser??chrome;window.errors=[];addEventListener("error",e=>errors.push(e.message));window.originalFetch=fetch;window.fetch=(url,options)=>String(url).startsWith("https://suggest.yandex.ru/")?Promise.resolve(new Response(JSON.stringify(["stable",["Stable suggestion"]]),{headers:{"Content-Type":"application/json"}})):String(url).startsWith("https://scroll.example/")?Promise.resolve(new Response("",{status:404})):originalFetch(url,options);const root=(await api.storage.local.get("rootFolderId")).rootFolderId;window.scrollRoot=(await api.bookmarks.create({parentId:root,title:"Scroll stability"})).id;await api.bookmarks.create({parentId:scrollRoot,title:"Stable tile",url:"https://scroll.example/"});await api.storage.local.set({rootFolderId:scrollRoot});');
 await until('return document.querySelectorAll(".bookmark").length===1&&document.querySelector(".folder-root").textContent.trim()==="Scroll stability";');
 const geometry=()=>exec('const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,width:r.width};};return {search:box(document.querySelector(".search")),folders:box(document.querySelector(".folder-scroll")),grid:box(document.querySelector(".bookmarks")),tile:box(document.querySelector(".bookmark"))};');
 for(const width of [320,360,1280,1920]){
  await resize(width,800);await exec('scrollTo(0,0);for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);');
  assert.equal(await exec('return document.documentElement.scrollWidth<=innerWidth;'),true,'no horizontal overflow at '+width);
  assert.equal(await exec('return document.scrollingElement.scrollHeight>document.scrollingElement.clientHeight;'),false);
  const before=await geometry();
  await exec('window.added=[];for(let i=0;i<60;i++)added.push((await api.bookmarks.create({parentId:scrollRoot,title:"Tile "+i,url:"https://scroll.example/"})).id);');
  await until('return document.querySelectorAll(".bookmark").length===61;');
  assert.equal(await exec('return document.scrollingElement.scrollHeight>document.scrollingElement.clientHeight;'),true);
  assert.deepEqual(await geometry(),before,'page scrollbar must not shift or resize content at '+width);
  await exec('for(const id of added)await api.bookmarks.remove(id);');await until('return document.querySelectorAll(".bookmark").length===1;');
  assert.deepEqual(await geometry(),before,'removing page scrollbar must keep layout at '+width);
 }
 const gutters=[];
 async function probe(selector){
  const result=await exec('const el=document.querySelector(arguments[0]),style=el.getAttribute("style"),nodes=[...el.childNodes],marker=document.createElement("div"),spacer=document.createElement("div");marker.textContent="Stable content";marker.style.cssText="height:40px;min-width:140px";spacer.style.cssText="height:1200px;width:1px;flex:none";el.replaceChildren(marker);el.style.maxHeight="200px";el.style.overflowX="hidden";const measure=()=>{const r=el.getBoundingClientRect(),m=marker.getBoundingClientRect(),s=getComputedStyle(el);return {box:r.width,content:el.clientWidth,left:m.left,width:m.width,gutter:r.width-el.clientWidth-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth)};};try{el.scrollTop=0;const before=measure(),initialOverflow=el.scrollHeight>el.clientHeight;el.appendChild(spacer);await new Promise(requestAnimationFrame);const after=measure(),overflow=el.scrollHeight>el.clientHeight;spacer.remove();return {before,after,restored:measure(),initialOverflow,overflow,policy:getComputedStyle(el).scrollbarGutter};}finally{el.replaceChildren(...nodes);if(style===null)el.removeAttribute("style");else el.setAttribute("style",style);el.scrollTop=0;}',selector);
  assert.equal(result.initialOverflow,false,selector+' starts without overflow');assert.equal(result.overflow,true,selector+' gains a scrollbar');
  if (selector === '.settings-content' || selector === '.modal') {
   assert.equal(result.policy, 'stable', selector + ' reserves gutter');
   assert.deepEqual(result.after, result.before, selector + ' content must not move or shrink');
  } else {
   assert.equal(result.policy, 'auto', selector + ' only uses space when overflowing');
   assert.ok(Math.abs(result.before.gutter) < 1, selector + ' starts without reserved space');
  }
  assert.deepEqual(result.restored,result.before,selector+' keeps layout when scrollbar disappears');gutters.push([selector,result.before.gutter]);
 }
 await resize(1280,800);await exec('document.querySelector(".settings-trigger").click();');await until('return !!document.querySelector(".settings")&&!document.querySelector(".settings-panel-enter-active");');
 await probe('.settings-content');
 await exec('const e=document.querySelector("button[aria-label=\\"О синхронизации\\"]");e.focus();e.click();');await until('return getComputedStyle(document.querySelector("#sync-info")).visibility==="visible";');await probe('#sync-info');await key('Escape');
 await key('Escape');await until('return !document.querySelector(".settings");');
 await exec('const e=document.querySelector(".bookmark");e.focus();e.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:100,clientY:100}));');await until('return !!document.querySelector(".context");');await exec('[...document.querySelectorAll(".context button")].find(e=>e.textContent.trim()==="Изменить закладку").click();');
 await until('return !!document.querySelector(".bookmark-form")&&!document.querySelector(".modal-panel-enter-active");');await probe('.modal');
 await key('Escape');await until('return !document.querySelector("dialog");');
 await exec('const e=document.querySelector(".bookmark");e.focus();e.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:100,clientY:100}));');await until('return !!document.querySelector(".context");');await probe('.context');await key('Escape');
 await exec('const e=document.querySelector(".search input");e.focus();e.value="stable";e.dispatchEvent(new Event("input",{bubbles:true}));');await until('return !!document.querySelector(".suggestions");');await probe('.suggestions');
 assert.deepEqual(await exec('return errors;'),[]);console.log('PASS '+name+': stable page at 320/360/1280/1920 and settings/modal/menu/tooltip/suggestions overflow; reserved pixels '+JSON.stringify(gutters));
}
if(!process.argv.includes('--firefox-only')){
 const extension=resolve('.output/chrome-mv3'),context=await chromium.launchPersistentContext(resolve('.browser-test/scroll-stability-'+crypto.randomUUID()),{channel:'chromium',headless:true,args:['--disable-features=OverlayScrollbar,FluentOverlayScrollbar','--disable-extensions-except='+extension,'--load-extension='+extension]});
 try{const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),page=await context.newPage();await page.goto(worker.url().replace('background.js','newtab.html'));const exec=(body,...args)=>page.evaluate(new Function('args','return (async function(){'+body+'}).apply(null,args)'),args);await check('chrome',{exec,until:async body=>{const start=Date.now();while(!await exec(body)){if(Date.now()-start>15000)throw Error(body);await new Promise(r=>setTimeout(r,100));}},key:value=>page.keyboard.press(value),resize:(width,height)=>page.setViewportSize({width,height})});}finally{await context.close();}
}
if(!process.argv.includes('--chrome-only')){
 const ff=await launchFirefox();try{await ff.command('WebDriver:Navigate',{url:firefoxUrl});await check('firefox',{...ff,key:async value=>{const code={Escape:'\uE00C',Tab:'\uE004'}[value]??value;await ff.command('WebDriver:PerformActions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:code},{type:'keyUp',value:code}]}]});},resize:(width,height)=>ff.command('WebDriver:SetWindowRect',{width,height})});}finally{await ff.close();}
}
