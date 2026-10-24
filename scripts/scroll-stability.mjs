import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const out=resolve('.browser-test/scroll-stability');await mkdir(out,{recursive:true});
import {launchFirefox,firefoxUrl} from './firefox-driver.mjs';
async function check(name,{exec,until,key,resize,wheel,shot=async()=>{}}){
 await until('return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;');
 await exec('window.api=globalThis.browser??chrome;window.errors=[];addEventListener("error",e=>errors.push(e.message));window.originalFetch=fetch;window.fetch=(url,options)=>String(url).startsWith("https://suggest.yandex.ru/")?Promise.resolve(new Response(JSON.stringify(["stable",["Stable suggestion"]]),{headers:{"Content-Type":"application/json"}})):String(url).startsWith("https://scroll.example/")?Promise.resolve(new Response("",{status:404})):originalFetch(url,options);const root=(await api.storage.local.get("rootFolderId")).rootFolderId;window.scrollRoot=(await api.bookmarks.create({parentId:root,title:"Scroll stability"})).id;await api.bookmarks.create({parentId:scrollRoot,title:"Stable tile",url:"https://scroll.example/"});await api.storage.local.set({rootFolderId:scrollRoot});');
 await until('return document.querySelectorAll(".bookmark").length===1&&document.querySelector(".folder-root").textContent.trim()==="Scroll stability";');
 const geometry=()=>exec('const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,width:r.width};};return {search:box(document.querySelector(".search")),folders:box(document.querySelector(".folder-scroll")),grid:box(document.querySelector(".bookmarks")),tile:box(document.querySelector(".bookmark"))};');
 for(const width of [320,360,1280,1920]){
  await resize(width,800);await exec('scrollTo(0,0);for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);');
  assert.equal(await exec('return document.documentElement.scrollWidth<=innerWidth;'),true,'no horizontal overflow at '+width);
  assert.equal(await exec('return document.scrollingElement.scrollHeight>document.scrollingElement.clientHeight;'),false);
  assert.equal(await exec('return Math.abs(document.querySelector(".bookmark-content").getBoundingClientRect().right-innerWidth)<1;'),true,'scrollbar sits at the window edge');
  await until('const e=document.querySelector(".bookmark-content");return e.style.getPropertyValue("--bookmark-edge-top")==="0px"&&e.style.getPropertyValue("--bookmark-edge-bottom")==="0px";');
  const before=await geometry();
  await exec('window.added=[];for(let i=0;i<60;i++)added.push((await api.bookmarks.create({parentId:scrollRoot,title:"Tile "+i,url:"https://scroll.example/"})).id);');
  await until('return document.querySelectorAll(".bookmark").length===61;');
  assert.equal(await exec('return document.scrollingElement.scrollHeight>document.scrollingElement.clientHeight;'),false);
  assert.equal(await exec('const e=document.querySelector(".bookmark-content");return e.scrollHeight>e.clientHeight;'),true);
  assert.deepEqual(await geometry(),before,'page scrollbar must not shift or resize content at '+width);
  await until('const e=document.querySelector(".bookmark-content");return e.style.getPropertyValue("--bookmark-edge-top")==="0px"&&parseFloat(e.style.getPropertyValue("--bookmark-edge-bottom"))>0;');
  assert.equal(await exec('return getComputedStyle(document.querySelector(".bookmark-content")).maskImage;'),'none','native scrollbar remains unmasked');
  assert.equal(await exec('return getComputedStyle(document.querySelector(".bookmark")).maskImage.includes("linear-gradient");'),true,'tiles fade at the viewport edges');
  const header=await exec('return [...document.querySelectorAll(".search,.tools,.bookmark-toolbar")].map(e=>e.getBoundingClientRect().top);');
  const point=await exec('const r=document.querySelector(".bookmark-content").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+Math.min(r.height/2,100)};');
  await wheel(point.x,point.y,200);assert.equal(await exec('return document.querySelector(".bookmark-content").scrollTop>0;'),true,'wheel scrolls bookmarks');
  assert.deepEqual(await exec('return [...document.querySelectorAll(".search,.tools,.bookmark-toolbar")].map(e=>e.getBoundingClientRect().top);'),header,'search and folders stay visible');
  if(width===1280){
   await exec('document.querySelector(".settings-trigger").click();');await until('return !!document.querySelector(".settings");');
   await exec('const input=document.querySelector(".settings input[type=number]");window.previousWidth=Number(input.value);input.value="50";input.dispatchEvent(new Event("input",{bubbles:true}));');await key('Escape');await until('return !document.querySelector("dialog");');
   await until('return document.querySelector(".bookmarks").style.width==="50%";');
   const layout=await exec('const e=document.querySelector(".bookmark-content"),r=e.getBoundingClientRect(),g=document.querySelector(".bookmarks").getBoundingClientRect(),s=getComputedStyle(e);e.scrollTop=0;return {right:r.right,center:g.x+g.width/2,width:g.width,available:e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)};');
   assert.ok(Math.abs(layout.right-width)<1);assert.ok(Math.abs(layout.center-width/2)<1,'50% grid stays centered');assert.ok(Math.abs(layout.width-layout.available/2)<1,'only grid uses 50% width');
   await wheel(5,point.y,200);assert.equal(await exec('return document.querySelector(".bookmark-content").scrollTop>0;'),true,'empty side area scrolls bookmarks at 50% width');
   await exec('const {settings}=await api.storage.local.get("settings");await api.storage.local.set({settings:{...settings,value:{...settings.value,width:previousWidth}}});');await until('return document.querySelector(".bookmarks").style.width===previousWidth+"%";');
  }
  await until('return parseFloat(document.querySelector(".bookmark-content").style.getPropertyValue("--bookmark-edge-top"))>0;');
  if(width===1280){
   await shot(name+'-edges-middle');
   await exec('const style=document.createElement("style");style.id="edge-comparison";style.textContent="[data-bookmark-edge-item]{mask-image:none!important}";document.head.append(style);');await shot(name+'-edges-disabled');await exec('document.querySelector("#edge-comparison").remove();');
  }
  await exec('const e=document.querySelector(".bookmark-content");e.scrollTop=e.scrollHeight;');await until('return document.querySelector(".bookmark-content").style.getPropertyValue("--bookmark-edge-bottom")==="0px";');
  assert.equal(await exec('return parseFloat(document.querySelector(".bookmark-content").style.getPropertyValue("--bookmark-edge-top"))>0;'),true);
  await exec('document.querySelector(".bookmark-content").scrollTop=200;');
  const position=await exec('return {y:scrollY,bookmarks:document.querySelector(".bookmark-content").scrollTop,width:document.querySelector(".bookmark-content").clientWidth};');
  await exec('document.querySelector(".settings-trigger").click();');await until('return !!document.querySelector(".settings")&&!document.querySelector(".settings-panel-enter-active");');
  await wheel(point.x,point.y,600);assert.deepEqual(await exec('return {y:scrollY,bookmarks:document.querySelector(".bookmark-content").scrollTop,width:document.querySelector(".bookmark-content").clientWidth};'),position,'settings lock background without changing gutter');
  const panel=await exec('const e=document.querySelector(".settings-content"),r=e.getBoundingClientRect();e.scrollTop=0;return {x:r.x+r.width/2,y:r.y+Math.min(r.height/2,100)};');
  await wheel(panel.x,panel.y,600);assert.equal(await exec('return document.querySelector(".settings-content").scrollTop>0;'),true,'settings retain internal scrolling');
  await exec('[...document.querySelectorAll(".settings button")].find(e=>e.textContent.trim()==="Управление данными").click();');
  await until('return !!document.querySelector(".data-management")&&!document.querySelector(".settings")&&!document.querySelector(".modal-panel-enter-active");');
  await wheel(5,5,600);assert.deepEqual(await exec('return {y:scrollY,bookmarks:document.querySelector(".bookmark-content").scrollTop,width:document.querySelector(".bookmark-content").clientWidth};'),position,'data modal locks background after settings close');
  const modal=await exec('const e=document.querySelector(".modal"),spacer=document.createElement("div");spacer.style.height="1600px";spacer.dataset.scrollProbe="";e.append(spacer);const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+Math.min(r.height/2,100)};');
  await wheel(modal.x,modal.y,500);assert.equal(await exec('return document.querySelector(".modal").scrollTop>0;'),true,'modal retains internal scrolling');
  await exec('document.querySelector(".modal").scrollTop=100000;');await wheel(modal.x,modal.y,500);assert.deepEqual(await exec('return {y:scrollY,bookmarks:document.querySelector(".bookmark-content").scrollTop,width:document.querySelector(".bookmark-content").clientWidth};'),position,'scroll at modal boundary cannot reach page');
  await key('Escape');await until('return !document.querySelector("dialog")&&document.activeElement?.matches(".settings-trigger");');assert.deepEqual(await exec('return {y:scrollY,bookmarks:document.querySelector(".bookmark-content").scrollTop,width:document.querySelector(".bookmark-content").clientWidth};'),position,'closing modal restores same page position');
  await wheel(point.x,point.y,250);assert.equal(await exec('return document.querySelector(".bookmark-content").scrollTop>arguments[0]&&scrollY===0;',position.bookmarks),true,'bookmark scroll unlocks after closing');
  await exec('document.querySelector(".bookmark-content").scrollTop=0;');
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
 try{const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),page=await context.newPage();await page.goto(worker.url().replace('background.js','newtab.html'));const exec=(body,...args)=>page.evaluate(new Function('args','return (async function(){'+body+'}).apply(null,args)'),args);await check('chrome',{exec,until:async body=>{const start=Date.now();while(!await exec(body)){if(Date.now()-start>15000)throw Error(body);await new Promise(r=>setTimeout(r,100));}},key:value=>page.keyboard.press(value),resize:(width,height)=>page.setViewportSize({width,height}),shot:label=>page.screenshot({path:resolve(out,label+'.png')}),wheel:async(x,y,deltaY)=>{await page.mouse.move(x,y);await page.mouse.wheel(0,deltaY);await page.waitForTimeout(250);}});await page.emulateMedia({forcedColors:'active'});assert.equal(await page.locator('.bookmark').first().evaluate(e=>getComputedStyle(e).maskImage),'none','forced colors keep tiles fully visible');}finally{await context.close();}
}
if(!process.argv.includes('--chrome-only')){
 const ff=await launchFirefox();try{await ff.command('WebDriver:Navigate',{url:firefoxUrl});await check('firefox',{...ff,key:async value=>{const code={Escape:'\uE00C',Tab:'\uE004'}[value]??value;await ff.command('WebDriver:PerformActions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:code},{type:'keyUp',value:code}]}]});},resize:(width,height)=>ff.command('WebDriver:SetWindowRect',{width,height}),shot:async label=>writeFile(resolve(out,label+'.png'),Buffer.from(await ff.command('WebDriver:TakeScreenshot',{}),'base64')),wheel:async(x,y,deltaY)=>{await ff.command("WebDriver:PerformActions",{actions:[{type:"wheel",id:"wheel",actions:[{type:"scroll",x:Math.round(x),y:Math.round(y),deltaX:0,deltaY,duration:100}]}]});await new Promise(r=>setTimeout(r,250));}});}finally{await ff.close();}
}
