import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {launchFirefox,firefoxUrl} from './firefox-driver.mjs';
const live=process.argv.includes('--live');
const headed=process.argv.includes('--headed');
const out=resolve('.browser-test/search-providers');await mkdir(out,{recursive:true});
const providers=['yandex','google','kinopoisk','imdb','myshows'];
const names=['Яндекс','Google','Кинопоиск','IMDb','MyShows'];
const queries={yandex:'Матрица',google:'привет мир & C++',kinopoisk:'Матрица',imdb:'Matrix',myshows:'Breaking Bad'};
const hosts={'suggest.yandex.ru':'yandex','suggestqueries.google.com':'google','graphql.kinopoisk.ru':'kinopoisk','v3.sg.media-imdb.com':'imdb','api.myshows.me':'myshows'};
const fixtures=Object.fromEntries(await Promise.all(providers.map(async id=>[id,JSON.parse(await readFile(`tests/fixtures/search-providers/${id}.json`,'utf8'))])));
const results=[];
const extension=resolve('.output/chrome-mv3');
const ctx=await chromium.launchPersistentContext(resolve('.browser-test','provider-ui-'+crypto.randomUUID()),{channel:'chromium',headless:!headed,args:['--disable-extensions-except='+extension,'--load-extension='+extension,...(headed?['--start-minimized']:[])]});
try{
 const worker=ctx.serviceWorkers()[0]??await ctx.waitForEvent('serviceworker');const url=worker.url().replace('background.js','newtab.html');
 const page=await ctx.newPage(),requests=[],navigation=[],network=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{const id=hosts[new URL(r.url()).hostname];if(id)network.push({provider:id,status:r.status(),type:r.headers()['content-type']??null});if(live&&id==='kinopoisk')void r.text().then(body=>writeFile(resolve(out,'kinopoisk-live-response.json'),body)).catch(()=>{});});
 let releaseSlow;
 if(!live)await ctx.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url()),id=hosts[u.hostname];
   if(id){requests.push(id);if(u.searchParams.get('q')==='slow')await new Promise(resolve=>{releaseSlow=resolve;});
     if(u.searchParams.get('q')==='blocked'||u.pathname.endsWith('/blocked.json')){await route.fulfill({status:403,body:'blocked'});return;}
     await route.fulfill({contentType:id==='yandex'||id==='google'?'text/javascript; charset=UTF-8':'application/json',body:JSON.stringify(fixtures[id])}).catch(()=>{});return;}
   if(req.isNavigationRequest()&&['www.yandex.ru','www.google.com','www.kinopoisk.ru','www.imdb.com','myshows.me'].includes(u.hostname)){navigation.push(req.url());await route.fulfill({contentType:'text/html',body:'<title>Search navigation test</title>'});return;}
   await route.continue();
 });
 await page.goto(url);const select=page.getByRole('combobox',{name:'Где искать',exact:true}),input=page.locator('.search input');
 await expect(select).toBeEnabled();await expect(select).toHaveValue('yandex');
 expect(await select.locator('option').allTextContents()).toEqual(names);expect(await select.locator('optgroup').count()).toBe(0);
 for(const id of providers){
   await input.fill('');await expect(select).toBeEnabled();await select.selectOption(id);await expect(select).toBeEnabled();
   await expect.poll(()=>page.evaluate(async()=> (await chrome.storage.local.get('settings')).settings?.value.searchProvider??'yandex')).toBe(id);
   const start=requests.length;await input.fill(queries[id]);
   if(live){
     await expect.poll(async()=>await page.locator('.suggestions li').count() || await page.locator('.search [role=status]').count(),{timeout:12000}).toBeGreaterThan(0);
     const labels=await page.locator('.suggestions li').allTextContents();results.push({browser:'chrome',provider:id,status:labels.length?'PASS':'BLOCKED',labels,message:(await page.locator('.search [role=status]').allTextContents()).join(''),network:network.filter(r=>r.provider===id).slice(-1)});
     console.log(results.at(-1));
   }else{
     await expect(page.locator('.suggestions li').first()).toBeVisible();expect(requests.slice(start).every(source=>source===id)).toBe(true);
     const typed=await input.inputValue();await input.press('ArrowDown');await expect(page.locator('.suggestions [aria-selected=true]')).toHaveCount(1);await expect(input).toHaveValue(typed);
     // The Find button must use raw input even when a suggestion is highlighted.
     await page.locator('.search-submit').click();await expect(page).not.toHaveURL(url);
     const target=new URL(navigation.at(-1));expect([...target.searchParams.values()]).toContain(typed);
     await page.goto(url);await expect(select).toHaveValue(id);await expect(select).toBeEnabled();await input.fill(queries[id]);await expect(page.locator('.suggestions li').first()).toBeVisible();
     await input.press('ArrowDown');await input.press('Enter');await expect(page).not.toHaveURL(url);
     const destination=navigation.at(-1);if(id==='imdb')expect(destination).toBe('https://www.imdb.com/title/tt0133093/');
     if(id==='kinopoisk')expect(destination).toBe('https://www.kinopoisk.ru/film/301/');if(id==='myshows')expect(destination).toBe('https://myshows.me/view/187/');
     await page.goto(url);await expect(select).toBeEnabled();
   }
   if(id==='myshows'&&live){await input.fill('Во все тяжкие');await expect.poll(async()=>await page.locator('.suggestions li').count()||await page.locator('.search [role=status]').count(),{timeout:12000}).toBeGreaterThan(0);}
 }
 if(!live){
   await input.fill('');await select.selectOption('google');await expect(select).toBeEnabled();await input.fill('slow');
   await expect.poll(()=>typeof releaseSlow).toBe('function');await select.selectOption('imdb');await expect(select).toBeEnabled();
   await expect(input).toHaveValue('slow');await expect(page.locator('.suggestions li').first()).toContainText('The Matrix');releaseSlow();
   await input.press('Escape');await expect(page.locator('.suggestions')).toHaveCount(0);
   await input.fill('blocked');await expect(page.locator('.search [role=status]')).toContainText('Подсказки временно недоступны');
   await page.locator('.search-submit').click();await expect(page).not.toHaveURL(url);expect(navigation.at(-1)).toBe('https://www.imdb.com/find/?q=blocked');await page.goto(url);await expect(select).toBeEnabled();
   await page.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');settings.value.searchProvider='unknown';await chrome.storage.local.set({settings});});await page.reload();await expect(select).toHaveValue('yandex');
   for(const [width,height]of[[360,800],[1280,800],[1920,1080]]){
     await page.setViewportSize({width,height});
     for(const id of providers){await input.fill('');await expect(select).toBeEnabled();await select.selectOption(id);await expect(select).toBeEnabled();await input.fill(queries[id]);await expect(page.locator('.suggestions li').first()).toBeVisible();
       const a=await select.boundingBox(),b=await input.boundingBox(),c=await page.locator('.search-submit').boundingBox();expect(a.x+a.width).toBeLessThanOrEqual(b.x+1);expect(b.x+b.width).toBeLessThanOrEqual(c.x+1);expect(b.width).toBeGreaterThan(60);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
       await page.screenshot({path:resolve(out,`${id}-${width}.png`)});
     }
   }
   expect(errors).toEqual([]);console.log('PASS Chrome provider UI: flat select, persistence, own requests, keyboard/raw button, direct links, stale cancellation, failures, 15 responsive screenshots');
 }
}finally{await ctx.close();}
if(!process.argv.includes('--chrome-only')) {
const driver=await launchFirefox();try{
 await driver.command('WebDriver:Navigate',{url:firefoxUrl});await driver.until('return !!document.querySelector(".search select")&&!document.querySelector(".search select").disabled;');
 if(!live)await driver.exec('window.providerCalls=[];const fixtures=arguments[0],hosts=arguments[1],original=window.fetch;window.fetch=async function(url,init){const id=hosts[new URL(String(url)).hostname];if(!id)return original(url,init);window.providerCalls.push(id);return new Response(JSON.stringify(fixtures[id]),{headers:{"content-type":"application/json"}});};',fixtures,hosts);
 assert.deepEqual(await driver.exec('return Array.from(document.querySelectorAll(".search select option"),x=>x.textContent);'),names);
 for(const id of providers){
   await driver.exec('const input=document.querySelector(".search input");input.value="";input.dispatchEvent(new Event("input",{bubbles:true}));const select=document.querySelector(".search select");select.value=arguments[0];select.dispatchEvent(new Event("change",{bubbles:true}));',id);
   await driver.until('return !document.querySelector(".search select").disabled;');
   await driver.exec('const input=document.querySelector(".search input");input.focus();input.value=arguments[0];input.dispatchEvent(new Event("input",{bubbles:true}));',queries[id]);
   await driver.until('return !!document.querySelector(".suggestions li,.search [role=status]");',12000);
   const labels=await driver.exec('return Array.from(document.querySelectorAll(".suggestions li"),x=>x.textContent);');
   if(live){results.push({browser:'firefox',provider:id,status:labels.length?'PASS':'BLOCKED',labels});console.log(results.at(-1));}
   else{assert.ok(labels.length>0);await driver.exec('document.querySelector(".search input").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true,cancelable:true}));');assert.equal(await driver.exec('return document.querySelector(".search input").value;'),queries[id]);assert.equal(await driver.exec('return document.querySelectorAll(".suggestions [aria-selected=true]").length;'),1);assert.equal(await driver.exec('return (await browser.storage.local.get("settings")).settings?.value.searchProvider??"yandex";'),id);}
 }
 if(!live)console.log('PASS Firefox provider UI: flat select, persistence, real-fixture parsers, keyboard keeps raw query');
}finally{await driver.close();}
}
if(live){await writeFile(resolve(out,headed?'live-headed-results.json':'live-results.json'),JSON.stringify({checkedAt:new Date().toISOString(),headless:!headed,results},null,2));if(results.some(row=>row.status==='BLOCKED'))process.exitCode=2;}
