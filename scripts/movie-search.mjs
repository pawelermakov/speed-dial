import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { launchFirefox, firefoxUrl } from './firefox-driver.mjs';

async function check(name,{exec,until,key,reload}) {
 await until('return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;');
 const options=()=>exec('return [...document.querySelectorAll(".search option")].map(e=>e.value);');
 assert.deepEqual(await options(),['yandex','google','bookmarks']);
 const toggle=async()=>{await exec('document.querySelector(".settings-trigger").click();');await until('return !!document.querySelector(".settings");');await exec('[...document.querySelectorAll(".switch-control")].find(e=>e.textContent.trim()==="Поиск фильмов и сериалов").querySelector("input").click();');await key('Escape');await until('return !document.querySelector("dialog");');};
 await toggle();await until('return document.querySelectorAll(".search option").length===6;');
 await exec('const e=document.querySelector(".search select");e.value="imdb";e.dispatchEvent(new Event("change",{bubbles:true}));');
 await until('return ((await (globalThis.browser??chrome).storage.local.get("settings")).settings?.value.searchProvider)==="imdb";');
 await reload();await until('return document.querySelector(".search select")?.value==="imdb"&&!document.querySelector(".settings-trigger").disabled;');
 await toggle();await until('return document.querySelector(".search select").value==="yandex"&&document.querySelectorAll(".search option").length===3;');
 assert.equal(await exec('return (await (globalThis.browser??chrome).storage.local.get("settings")).settings.value.movieSearch;'),false);
 await reload();await until('return document.querySelectorAll(".search option").length===3;');
 console.log('PASS '+name+': movie setting defaults, opt-in, selection persistence, disable fallback and reload');
}

if(!process.argv.includes('--firefox-only')) {
 const extension=resolve('.output/chrome-mv3');
 const context=await chromium.launchPersistentContext(resolve('.browser-test/parity-chrome-'+crypto.randomUUID()),{locale:'ru-RU',channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
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
