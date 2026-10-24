import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const output=resolve('.browser-test/toolbar-audit');await mkdir(output,{recursive:true});
const extension=resolve('.output/chrome-mv3');
const context=await chromium.launchPersistentContext(resolve('.browser-test/toolbar-'+crypto.randomUUID()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
let count=3,mailError=false;
try {
 await context.route('https://portal.mail.ru/NaviData?**',route=>route.fulfill({status:mailError?503:200,contentType:'application/json',body:JSON.stringify({status:'ok',data:{mail_cnt:count}})}));
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(worker.url().replace('background.js','newtab.html'));
 const gear=page.getByRole('button',{name:'Настройки',exact:true}),mail=page.getByRole('link',{name:'Открыть почту Mail.ru',exact:true}),local=page.locator('.search select'),field=page.locator('.search input'),folders=page.locator('.folder-tabs'),scroll=page.locator('.folder-scroll');
 await expect(gear).toBeEnabled();
 await page.evaluate(async()=>{const {rootFolderId}=await chrome.storage.local.get('rootFolderId');for(let i=0;i<30;i++)await chrome.bookmarks.create({parentId:rootFolderId,title:'Папка с длинным названием '+i});await chrome.bookmarks.create({parentId:rootFolderId,title:'Toolbar fixture',url:'https://toolbar.example/'});const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{value:{...settings?.value,email:'audit@mail.ru',addButton:true}}})});await page.reload();await expect(mail.locator('.badge')).toHaveText('3');
 const setEmail=async suffix=>page.evaluate(async suffix=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{value:{...settings.value,email:'audit'+suffix+'@mail.ru'}}})},suffix);
 await page.addStyleTag({content:'.page-background {opacity:1!important;background:var(--toolbar-background,#fff)!important}'});
 for(const width of [320,360,768,1024,1280,1920]) {
  await page.setViewportSize({width,height:700});
  for(const control of [gear,mail]) {await expect(control).toHaveCSS('width','48px');await expect(control).toHaveCSS('height','48px');await expect(control).toHaveCSS('border-radius','24px');await expect(control).toHaveCSS('border-top-width','1px');await expect(control).toHaveCSS('backdrop-filter','blur(12px)');await expect(control).toHaveCSS('box-shadow','none');await expect(control.locator('svg').first()).toHaveCSS('width','20px');}
  for(const scrollbar of ['none','auto']) {
   const style=await page.addStyleTag({content:'.folder-scroll {scrollbar-width:'+scrollbar+'!important}.folder-scroll::-webkit-scrollbar {height:16px}'});
   const a=await page.locator('.folder-root').boundingBox();assert.equal(a.height,48);await style.evaluate(e=>e.remove());
  }
  await expect(page.locator('.folder-root')).toHaveCSS('border-radius','24px');await expect(page.locator('.folder-root')).toHaveCSS('box-shadow','none');
  for(const [name,background] of [['light','#fff'],['dark','#000'],['pattern','repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0/32px 32px']]) {
   await page.locator('.page').evaluate((e,b)=>e.style.setProperty('--toolbar-background',b),background);
   for(const control of [gear,mail,page.locator('.folder-tab').first()]) {
    await control.hover();const surface=control;await expect(surface).toHaveCSS('background-color','rgba(255, 255, 255, 0.65)');await page.mouse.down();await expect(surface).toHaveCSS('background-color','rgba(255, 255, 255, 0.55)');if(control===mail)await expect(mail).toHaveCSS('color','rgb(23, 33, 47)');await page.mouse.move(1,1);await page.mouse.up();
   }
   await page.screenshot({animations:'disabled',path:resolve(output,width+'-'+name+'.png')});
  }
  await local.selectOption('bookmarks');await field.focus();await expect(page.getByRole('searchbox')).toBeFocused();await expect(folders).toBeVisible();await expect(folders).not.toHaveAttribute('inert','');
  await page.getByRole('searchbox').fill('Toolbar');await expect(page.locator('.bookmark')).toHaveCount(1);await page.keyboard.press('Escape');await expect(field).toHaveValue('');await expect(folders).toBeVisible();await expect(field).toBeFocused();
  await gear.click();await expect(page.locator('.settings')).toBeVisible();await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();await expect(page.locator('.settings')).toHaveCount(0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.evaluate(()=>{const connect=chrome.runtime.connect;chrome.runtime.connect=options=>{if(options?.name!=='speed-dial-capture')return connect.call(chrome.runtime,options);let listener;return{onMessage:{addListener:f=>listener=f,removeListener:()=>{}},onDisconnect:{addListener:()=>{},removeListener:()=>{}},disconnect:()=>{},postMessage:request=>{window.finishToolbarCapture=()=>listener({requestId:request.requestId,error:'Audit controlled capture failure'});}}}});
 await page.getByRole('button',{name:'Новая закладка',exact:true}).click();await page.getByRole('textbox',{name:'Адрес сайта',exact:true}).fill('https://busy.example/');await page.locator('.bookmark-form button[type=submit]').click();
 await expect(gear).toBeDisabled();await expect(local).toBeDisabled();await expect(page.locator('.folder-root')).toBeDisabled();await expect(gear).toHaveCSS('background-color','rgb(226, 232, 240)');await expect(gear).toHaveCSS('cursor','not-allowed');await expect(gear).toHaveCSS('box-shadow','none');await expect(field).toBeDisabled();
 await page.evaluate(()=>window.finishToolbarCapture());await expect(gear).toBeEnabled();await expect(page.locator('dialog')).toHaveCount(0);
 for(const value of [0,120]) {count=value;await setEmail(String(value));await expect(mail).toBeVisible();if(value)await expect(mail.locator('.badge')).toHaveText('99+');else await expect(mail.locator('.badge')).toHaveCount(0);}
 mailError=true;await setEmail('failure');await expect(page.locator('.mail-error')).toHaveCount(1);await page.setViewportSize({width:320,height:400});await mail.hover();const error=page.locator('.mail-error');await expect(error).toBeVisible();await expect(error).toHaveCSS('font-size','14px');await expect(error).toHaveCSS('color','rgb(74, 8, 8)');await expect(error).toHaveCSS('border-radius','10px');await expect(error).toHaveCSS('backdrop-filter','blur(12px) saturate(1.6)');await expect(error).toHaveCSS('opacity','1');const e=await error.boundingBox(),m=await mail.boundingBox();assert(e.y>=m.y+m.height+8);assert(e.x>=16&&e.x+e.width<=304);await page.screenshot({animations:'disabled',path:resolve(output,'mail-error.png')});
 await page.mouse.move(1,1);await expect(error).toHaveCSS('opacity','0');await page.keyboard.press('Tab');await mail.focus();await expect(error).toBeVisible();await expect(mail).toHaveCSS('outline-width','2px');
 await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await expect(scroll).toHaveCSS('mask-image','none');await expect(page.locator('.folder-tab').first()).toHaveCSS('mask-image','none');await expect(page.locator('.folder-tab').first()).toHaveCSS('transition-duration','0s');await gear.focus();await expect(gear).toHaveCSS('outline-width','2px');
 await page.emulateMedia({forcedColors:'none'});const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});await page.mouse.move(1,1);
 for(const surface of [gear,mail]){await expect(surface).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(surface).toHaveCSS('backdrop-filter','none');}
 assert.deepEqual(errors,[]);console.log('PASS toolbar audit: six widths, 3 backgrounds, geometry/radii/borders, hover/pressed, scroll alignment, unified search/folders/focus, mail counts/error, forced colors/reduced motion');
} finally {await context.close()}
