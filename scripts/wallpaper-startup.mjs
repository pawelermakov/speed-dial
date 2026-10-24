import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { launchFirefox, firefoxUrl } from './firefox-driver.mjs';
const out=resolve('.browser-test/wallpaper-startup');await mkdir(out,{recursive:true});
if(!process.argv.includes('--firefox-only')) {
const context=await chromium.launchPersistentContext(resolve('.browser-test/wallpaper-'+crypto.randomUUID()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+resolve('.output/chrome-mv3'),'--load-extension='+resolve('.output/chrome-mv3')]});
try {
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=worker.url().replace('background.js','newtab.html');
 await page.goto(url);
 const open=async()=>{const button=page.getByRole('button',{name:'Настройки',exact:true});await expect(button).toBeEnabled();await button.focus();await page.keyboard.press('Enter');await expect(page.locator('.settings')).toBeVisible();};
 const close=async()=>{await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();await expect(page.locator('.settings')).toHaveCount(0);};
 const upload=async color=>{
  const png=await page.evaluate(color=>{const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const c=canvas.getContext('2d');c.fillStyle=color;c.fillRect(0,0,1920,1080);return canvas.toDataURL('image/png').split(',')[1];},color);
  await page.getByLabel('Изменить фон',{exact:true}).setInputFiles({name:'wallpaper.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect.poll(()=>page.locator('.page-background').evaluate(e=>e.style.backgroundImage)).toContain('blob:');
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('speed-dial-background-preview'))).toMatch(/^data:image\/jpeg;base64,/);
 };
 await open();await upload('#247a49');await close();
 const preview=await page.evaluate(()=>localStorage.getItem('speed-dial-background-preview'));
 assert.ok(preview.length<=300000);
 // Also hold the first blob decode to inspect the handoff from the document to Vue.
 await page.addInitScript(()=>{
  const decode=HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode=function(){
   const decoded=decode.call(this);
   if(this.src.startsWith('blob:') && !window.wallpaperDecodeReleased)
    return decoded.then(()=>new Promise(resolve=>{
     (window.wallpaperDecodeWaiters??=[]).push(resolve);
     window.releaseWallpaperDecode=()=>{window.wallpaperDecodeReleased=true;window.wallpaperDecodeWaiters.splice(0).forEach(done=>done());};
    }));
   return decoded;
  };
 });
 // Hold the application bundle: the wallpaper must already paint without Vue or bookmarks.
 let release;const ready=new Promise(r=>release=r);let intercepted=false;
 await page.route('**/chunks/newtab-*.js',async route=>{intercepted=true;await ready;await route.continue();});
 await page.reload({waitUntil:'commit'});
 await expect.poll(()=>intercepted).toBe(true);
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).backgroundImage)).toContain('data:image/jpeg');
 assert.equal(await page.locator('.page').count(),0);
 await page.screenshot({path:resolve(out,'before-app.png')});
 release();await page.unrouteAll({behavior:'wait'});
 await expect.poll(()=>page.evaluate(()=>typeof window.releaseWallpaperDecode)).toBe('function');
 await expect(page.locator('.page')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(page.locator('.page-background')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(page.locator('.page-background')).toHaveCSS('opacity','0');
 await page.screenshot({path:resolve(out,'during-decode.png')});
 await page.evaluate(()=>window.releaseWallpaperDecode());
 await expect.poll(()=>page.locator('.page-background').evaluate(e=>e.style.backgroundImage)).toContain('blob:');
 await expect(page.locator('.page')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(page.locator('.page-background')).toHaveCSS('position','fixed');
 await expect(page.locator('.page-background')).toHaveCSS('opacity','1');
 assert.equal(await page.locator('.page-background').evaluate(e=>getComputedStyle(e).transitionProperty),'opacity');
 await page.screenshot({path:resolve(out,'after-load.png')});
 await open();await upload('#9b354a');
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('speed-dial-background-preview'))).not.toBe(preview);
 await page.getByRole('button',{name:'Удалить фон',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('speed-dial-background-preview'))).toBe(null);
 assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--startup-background')),'');
 await close();await page.reload();await expect(page.getByRole('button',{name:'Настройки',exact:true})).toBeEnabled();
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundImage),'none');
 // A missing IndexedDB image also invalidates an obsolete preview on startup.
 await page.evaluate(preview=>localStorage.setItem('speed-dial-background-preview',preview),preview);
 await page.reload();await expect(page.getByRole('button',{name:'Настройки',exact:true})).toBeEnabled();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('speed-dial-background-preview'))).toBe(null);
 assert.deepEqual(errors,[]);
 console.log('PASS wallpaper: preview paints before application startup, original replaces it, replacement/removal and stale cache cleanup');
} finally {await context.close();}


}
if(process.argv.includes('--firefox-only')) {
 const driver=await launchFirefox();
 try {
  await driver.command('WebDriver:Navigate',{url:firefoxUrl});
  await driver.until('return !!document.querySelector(".page")&&!document.querySelector("button[aria-label=Настройки]").disabled;');
  await driver.exec(`
   const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
   const c=canvas.getContext('2d');c.fillStyle='#247a49';c.fillRect(0,0,960,540);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   const db=await new Promise(resolve=>{const req=indexedDB.open('SpeedDialX');req.onsuccess=()=>resolve(req.result);});
   await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite');tx.objectStore('assets').put({key:'background',blob});tx.oncomplete=resolve;tx.onerror=reject;});db.close();
  `);
  await driver.command('WebDriver:Navigate',{url:firefoxUrl});
  await driver.until('return document.querySelector(".page-background")?.style.backgroundImage.includes("blob:") && !!localStorage.getItem("speed-dial-background-preview");');
  await driver.command('WebDriver:Navigate',{url:firefoxUrl});
  await driver.until('return getComputedStyle(document.documentElement).backgroundImage.includes("data:image/jpeg") && document.querySelector(".page-background")?.style.backgroundImage.includes("blob:");');
  console.log('PASS Firefox wallpaper: local preview persists across reload and the original is displayed');
 }finally{await driver.close();}
}
