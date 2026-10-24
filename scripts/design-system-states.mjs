// Chromium interaction-state audit against the production extension. Run after npm run build.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve('.browser-test/style-audit');await mkdir(out,{recursive:true});
const extension=resolve('.output/chrome-mv3');
const context=await chromium.launchPersistentContext(resolve('.browser-test/style-audit-'+crypto.randomUUID()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension],viewport:{width:1280,height:800}});
const results=[];
try {
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**://suggest.yandex.ru/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(['test',['A long search suggestion for layout and overflow','A second search suggestion']])}));
 await page.goto(worker.url().replace('background.js','newtab.html'));
 const gear=page.getByRole('button',{name:'Настройки',exact:true});await expect(gear).toBeEnabled();
 const png=Array.from(await readFile('public/images/icon128.png'));
 await page.evaluate(async bytes=>{const {rootFolderId}=await chrome.storage.local.get('rootFolderId');for(const title of ['Работа и длинное название папки','Личное','Путешествия'])await chrome.bookmarks.create({parentId:rootFolderId,title});await chrome.bookmarks.create({parentId:rootFolderId,title:'A very long text tile title',url:'https://text.example/'});const row=await chrome.bookmarks.create({parentId:rootFolderId,title:'A long screenshot caption with a favicon and overflow',url:'https://image.example/'});const db=await new Promise(resolve=>{const request=indexedDB.open('SpeedDialX');request.onsuccess=()=>resolve(request.result)});await new Promise((resolve,reject)=>{const tx=db.transaction('tileAssets','readwrite');tx.objectStore('tileAssets').put({bookmarkId:row.id,url:row.url,thumbnail:new Blob([Uint8Array.from(bytes)],{type:'image/png'}),favicon:new Blob([Uint8Array.from(bytes)],{type:'image/png'})});tx.oncomplete=resolve;tx.onerror=reject;});db.close();const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{value:{...settings?.value,addButton:true}}});},png);
 await page.reload();await expect(page.locator('.bookmark-title')).toHaveCount(1);
 await page.addStyleTag({content:'.page-background {opacity:1!important;background:var(--audit-wallpaper,#000)!important}'});
 const css=async(selector,property)=>page.locator(selector).first().evaluate((e,p)=>getComputedStyle(e).getPropertyValue(p),property);
 const alpha=async selector=>{const bg=await css(selector,'background-color');return bg.startsWith('rgba')?Number(bg.match(/[\d.]+/g).at(-1)):1};
 const shot=async name=>page.screenshot({animations:'disabled',path:resolve(out,name+'.png')});
 const clear=async()=>{await page.locator('.search input').fill('');await page.locator('.search input').blur();await page.mouse.move(0,0)};
 for(const width of [320,360,768,1024,1280,1920]) {
  await page.setViewportSize({width,height:width<=360?640:800});
  await expect(gear.locator('svg')).toHaveCSS('width','20px');await expect(gear).toHaveCSS('height','48px');
  const folderBounds=await page.locator('.folder-root').boundingBox(),localBounds=await page.locator('.bookmark-search-field').boundingBox();assert.equal(localBounds.y,folderBounds.y,'local search must align with folders');
  await expect(page.locator('.search')).toHaveCSS('height','48px');await expect(page.locator('.folder-root')).toHaveCSS('height','48px');
  const sr=await page.locator('.search').boundingBox(),tr=await page.locator('.tools').boundingBox();assert(sr.y+sr.height<=tr.y||tr.y+tr.height<=sr.y||sr.x+sr.width<=tr.x,'header controls overlap');
  for(const background of ['#fff','#000','repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0/40px 40px']) {
   await page.locator('.page').evaluate((e,b)=>e.style.setProperty('--audit-wallpaper',b),background);
   for(const selector of ['.settings-trigger','.folder-tab','.add-card','.bookmark-search-field']) {
    await page.locator(selector).first().hover();await expect.poll(()=>alpha(selector)).toBeCloseTo(.65,2);
    if(['.settings-trigger','.folder-tab','.bookmark-search-field'].includes(selector))await expect.poll(()=>alpha(selector)).toBeCloseTo(.65,2);
   }
   await shot(width+'-'+(background==='#fff'?'light':background==='#000'?'dark':'pattern')+'-hover');
  }
  await page.getByRole('button',{name:'Поиск по закладкам',exact:true}).click();await expect(page.getByRole('searchbox')).toBeFocused();await expect(page.locator('.bookmark-search-field')).toHaveCSS('height','48px');await expect.poll(()=>alpha('.bookmark-search-field')).toBeGreaterThanOrEqual(.85);await shot(width+'-local-search');await page.getByRole('button',{name:'Закрыть поиск по закладкам',exact:true}).click();
  await page.locator('.search input').fill('test');await expect(page.locator('.suggestions [role=option]')).toHaveCount(2);await expect(page.locator('.suggestions')).toHaveCSS('backdrop-filter','blur(12px) saturate(1.6)');await shot(width+'-suggestions');await clear();
  await gear.click();await expect(page.locator('.settings')).toBeVisible();await expect(page.locator('.sync-account [role=status]')).toHaveCSS('font-size','16px');
  for(const input of await page.locator('.settings input[type=number]').all()) {await expect(input).toHaveCSS('width','88px');await expect(input).toHaveCSS('height','40px');await expect(input).toHaveCSS('backdrop-filter','none');}
  await page.getByRole('button',{name:'О синхронизации',exact:true}).focus();await expect(page.locator('#sync-info')).toBeVisible();await expect(page.locator('#sync-info')).toHaveCSS('font-size','14px');
  const tip=await page.locator('#sync-info').boundingBox();assert(tip.x>=0&&tip.x+tip.width<=width&&tip.y>=0&&tip.y+tip.height<=(width<=360?640:800),'tooltip outside viewport');
  await shot(width+'-settings-top');await page.getByRole('button',{name:'Импорт',exact:true}).scrollIntoViewIfNeeded();await page.mouse.move(0,0);await shot(width+'-settings-data');
  await page.getByRole('button',{name:'Импорт',exact:true}).click();await expect(page.locator('dialog.modal-screen')).toHaveCSS('opacity','1');await expect(page.locator('.modal')).toHaveCSS('backdrop-filter','blur(12px) saturate(1.6)');
  await page.locator('textarea').fill('{'.repeat(20000));await shot(width+'-import');await page.getByRole('button',{name:'Закрыть',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  await page.locator('.page').click({button:'right',position:{x:(await page.locator('.page').boundingBox()).width-2,y:heightSafe(width)}});await page.getByRole('menuitem',{name:'Новая папка',exact:true}).click();await expect(page.locator('dialog.modal-screen')).toHaveCSS('opacity','1');await page.getByRole('textbox',{name:'Название папки',exact:true}).fill('Папка');await expect(page.locator('.modal .ui-button')).toHaveCSS('height','40px');await shot(width+'-folder');await page.getByRole('button',{name:'Закрыть',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Новая закладка',exact:true}).click();await expect(page.locator('dialog.modal-screen')).toHaveCSS('opacity','1');await page.getByRole('button',{name:'О создании эскиза',exact:true}).focus();await expect(page.locator('#bookmark-capture-info')).toBeVisible();await shot(width+'-bookmark-tooltip');await page.getByRole('button',{name:'Закрыть',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);results.push({width,status:'PASS'});
 }
 await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await page.keyboard.press('Tab');await gear.focus();await expect(gear).not.toHaveCSS('outline-style','none');await gear.hover();await shot('forced-colors');
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS style audit:',results);
} finally {await context.close()}
function heightSafe(width){return width<=360?600:760}
