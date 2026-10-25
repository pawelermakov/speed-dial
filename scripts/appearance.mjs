import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {launchFirefox,firefoxUrl} from './firefox-driver.mjs';
const out=resolve('.browser-test/design-system');await mkdir(out,{recursive:true});
const ext=resolve('.output/chrome-mv3');
if(!process.argv.includes('--firefox-only')) {
const ctx=await chromium.launchPersistentContext(resolve('.browser-test/ds-'+crypto.randomUUID()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+ext,'--load-extension='+ext],viewport:{width:1280,height:720}});
try {
 const worker=ctx.serviceWorkers()[0]??await ctx.waitForEvent('serviceworker');
 const url=worker.url().replace('background.js','newtab.html');const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 const gear=page.getByRole('button',{name:'Настройки',exact:true});await expect(gear).toBeEnabled();
 await page.evaluate(async()=>{const {rootFolderId}=await chrome.storage.local.get('rootFolderId');for(let i=0;i<30;i++)await chrome.bookmarks.create({parentId:rootFolderId,title:'Folder '+i});await chrome.bookmarks.create({parentId:rootFolderId,title:'Example',url:'https://example.test/'});});
 await expect(page.locator('.folder-tab')).toHaveCount(30);
 for(const width of [320,360,1280,1920])for(const background of ['none','light','dark','pattern']) {
  await page.setViewportSize({width,height:width<481?640:900});
  await gear.click();await expect(page.locator('.settings')).toBeVisible();
  if(background==='none') {const remove=page.getByRole('button',{name:'Удалить фон',exact:true});if(await remove.count())await remove.click();}
  else {
   const buffer=Buffer.from(await page.evaluate(kind=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const c=canvas.getContext('2d');if(kind==='pattern'){for(let y=0;y<16;y++)for(let x=0;x<16;x++){c.fillStyle=['#000','#fff','#f00','#00f','#0f0'][(x+y)%5];c.fillRect(x*32,y*32,32,32);}}else{c.fillStyle=kind==='light'?'#fff':'#000';c.fillRect(0,0,512,512);}return canvas.toDataURL('image/png').split(',')[1];},background),'base64');
   await page.getByLabel('Изменить фон',{exact:true}).setInputFiles({name:background+'.png',mimeType:'image/png',buffer});await expect(page.getByRole('button',{name:'Удалить фон',exact:true})).toBeVisible();
  }
  await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();await expect(page.locator('.settings')).toHaveCount(0);
  await page.screenshot({animations:'disabled',path:resolve(out,`${width}-${background}-page.png`)});

  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const search=await page.locator('.search').boundingBox(),tools=await page.locator('.tools').boundingBox();assert(search.y+search.height<=tools.y||tools.y+tools.height<=search.y||search.x+search.width<=tools.x);
  await gear.click();await expect(page.locator('.settings')).toBeVisible();assert.deepEqual(await page.locator('.settings legend').allTextContents().then(x=>x.map(s=>s.trim().split('\n')[0])),['Оформление','Закладки','Сетка','Почта','Данные']);
  await expect(page.locator('.settings')).toHaveCSS('backdrop-filter','blur(12px) saturate(1.6)');await expect(page.locator('.settings input[type=number]').first()).toHaveCSS('backdrop-filter','none');await expect(page.locator('.dial')).toHaveCSS('filter','none');
  await page.screenshot({animations:'disabled',path:resolve(out,`${width}-${background}-settings.png`)});await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();await expect(page.locator('.settings')).toHaveCount(0);
  await page.locator('.page').click({button:'right',position:{x:(await page.locator('.page').boundingBox()).width-3,y:600}});await expect(page.getByRole('menu')).toBeVisible();const box=await page.getByRole('menu').boundingBox();assert(box.x>=0&&box.x+box.width<=width&&box.y+box.height<=900);await page.getByRole('menuitem',{name:'Новая папка',exact:true}).click();await expect(page.locator('.modal')).toHaveCSS('border-radius','24px');assert.equal(Math.round((await page.locator('.modal').boundingBox()).width),Math.min(360,(await page.locator('.modal-screen').evaluate(e=>e.clientWidth))-32));await page.getByLabel('Название папки',{exact:true}).fill('Draft');await expect(page.locator('dialog')).toHaveCSS('opacity','1');await page.screenshot({animations:'disabled',path:resolve(out,`${width}-${background}-dialog.png`)});await page.getByRole('button',{name:'Закрыть',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
 }
 await page.setViewportSize({width:640,height:360});await page.evaluate(()=>document.documentElement.style.zoom='2');await gear.click();await page.getByRole('switch',{name:'Показывать Mail.ru',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('switch',{name:'Показывать Mail.ru',exact:true})).toBeVisible();await page.screenshot({animations:'disabled',path:resolve(out,'zoom-200.png')});await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();await expect(page.locator('.settings')).toHaveCount(0);
 await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await page.keyboard.press('Tab');await gear.focus();assert.notEqual(await gear.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 assert.deepEqual(errors,[]);console.log('PASS Chromium design system: 30 folders, 320/360/1280/1920, 4 backgrounds, surfaces, layers, menus/dialogs, 200% zoom, forced colors/reduced motion');
} finally {await ctx.close();}
}
if(!process.argv.includes('--chrome-only')) {
const ff=await launchFirefox();try {
 await ff.command('WebDriver:Navigate',{url:firefoxUrl});await ff.until('return !!document.querySelector(".settings-trigger") && !document.querySelector(".settings-trigger").disabled');
 await ff.exec('document.querySelector(".settings-trigger").click();return true;');await ff.until('return !!document.querySelector(".settings")');
 assert.equal(await ff.exec('return getComputedStyle(document.querySelector(".settings")).backdropFilter;'),'blur(12px) saturate(1.6)');assert.equal(await ff.exec('return getComputedStyle(document.querySelector(".search")).height;'),'48px');
 console.log('PASS Firefox design system: settings, material, search geometry');
} finally {await ff.close();}





}
