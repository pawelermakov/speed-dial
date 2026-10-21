import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {launchFirefox,firefoxUrl} from './firefox-driver.mjs';
const out=resolve('.browser-test/appearance');await mkdir(out,{recursive:true});
const ext=resolve('.output/chrome-mv3'),png=await readFile('public/images/icon128.png');
const ctx=await chromium.launchPersistentContext(resolve('.browser-test/appearance-'+crypto.randomUUID()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+ext,'--load-extension='+ext],viewport:{width:1280,height:900}});
try{
 const worker=ctx.serviceWorkers()[0]??await ctx.waitForEvent('serviceworker');const url=worker.url().replace('background.js','newtab.html');
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await expect(page.getByRole('button',{name:'Настройки',exact:true})).toBeEnabled();
 const fixture=await page.evaluate(async bytes=>{const {rootFolderId}=await chrome.storage.local.get('rootFolderId');const a=await chrome.bookmarks.create({parentId:rootFolderId,title:'Appearance A'}),b=await chrome.bookmarks.create({parentId:rootFolderId,title:'Appearance B'});const text=await chrome.bookmarks.create({parentId:rootFolderId,title:'Text tile',url:'https://text.example/'}),image=await chrome.bookmarks.create({parentId:rootFolderId,title:'Screenshot tile',url:'https://image.example/'});const db=await new Promise(resolve=>{const r=indexedDB.open('SpeedDialX');r.onsuccess=()=>resolve(r.result);});await new Promise((resolve,reject)=>{const tx=db.transaction('tileAssets','readwrite');for(const node of [text,image])tx.objectStore('tileAssets').put({bookmarkId:node.id,url:node.url,favicon:new Blob([Uint8Array.from(bytes)],{type:'image/png'}),...(node.id===image.id?{thumbnail:new Blob([Uint8Array.from(bytes)],{type:'image/png'})}:{})});tx.oncomplete=resolve;tx.onerror=reject;});db.close();return{a:a.id,b:b.id};},Array.from(png));
 await page.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,value:{...settings?.value,addButton:true}}});});await page.reload();await expect(page.locator('.bookmark')).toHaveCount(2);
 await expect(page.locator('.add-card svg')).toHaveCSS('width','56px');
 const textTile=page.locator('.bookmark[href="https://text.example/"]');const tileColor=await textTile.evaluate(e=>getComputedStyle(e).backgroundColor);
 const open=async()=>{const button=page.getByRole('button',{name:'Настройки',exact:true});await expect(button).toBeEnabled();await button.focus();await button.press('Enter');await expect(page.getByRole('spinbutton',{name:'Скругление (px)',exact:true})).toBeVisible();};
 const close=async()=>{await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();await expect(page.locator('.settings')).toHaveCount(0);};
 const stored=key=>page.evaluate(async key=>(await chrome.storage.local.get('settings')).settings?.value[key],key);
 const set=async(name,value)=>{const input=page.getByLabel(name,{exact:true});await input.evaluate((e,value)=>{e.value=String(value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);};
 await open();
 assert.equal(await page.locator('.page').evaluate(e=>getComputedStyle(e).getPropertyValue('--ui-radius')),'5px');
 await page.getByRole('spinbutton',{name:'Скругление (px)',exact:true}).evaluate(e=>{e.value='24';e.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect.poll(()=>page.locator('.settings').evaluate(e=>getComputedStyle(e).borderTopLeftRadius)).toBe('24px');
 await close();await expect.poll(()=>stored('uiRadius')).toBe(24);
 const peer=await ctx.newPage();await peer.goto(url);await expect(peer.getByRole('button',{name:'Настройки',exact:true})).toBeEnabled();await peer.getByRole('button',{name:'Настройки',exact:true}).evaluate(e=>e.click());await expect(peer.getByLabel('Прозрачность (%)',{exact:true})).toBeVisible();
 await open();await Promise.all([set('Скругление (px)',12),peer.getByLabel('Прозрачность (%)',{exact:true}).evaluate(e=>{e.value='30';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})]);
 await expect.poll(()=>stored('uiRadius')).toBe(12);await expect.poll(()=>stored('uiTransparency')).toBe(30);await expect(peer.locator('.page')).toHaveCSS('--ui-radius','12px');await close();await peer.close();
 for(const radius of [0,5,12,24]){await open();await set('Скругление (px)',radius);await close();await expect(textTile).toHaveCSS('border-top-left-radius',radius+'px');await page.locator('.page').click({button:'right',position:{x:3,y:3}});await expect(page.getByRole('menu')).toHaveCSS('border-top-left-radius',radius+'px');await page.keyboard.press('Escape');}
 await page.getByRole('button',{name:'Appearance A',exact:true}).click();await expect(page.getByRole('button',{name:'Новая закладка',exact:true})).toHaveCSS('border-top-left-radius','24px');await page.locator('.category-root').click();
 await page.getByRole('button',{name:'Поиск по закладкам',exact:true}).click();await expect(page.getByRole('searchbox',{name:'Найти закладку',exact:true})).toHaveCSS('border-top-left-radius','24px');await page.keyboard.press('Escape');
 await open();await set('Цвет акцента','#3366cc');await expect.poll(()=>stored('uiAccent')).toBe('#3366CC');
 await set('Прозрачность (%)',50);await page.getByRole('checkbox',{name:'Размытие поверхностей',exact:true}).uncheck();await expect(page.locator('.settings')).toHaveCSS('backdrop-filter','none');
 await page.getByRole('button',{name:'Вернуть цвет по умолчанию',exact:true}).click();await expect.poll(()=>stored('uiAccent')).toBe('#FFCC00');assert.equal(await stored('uiRadius'),24);assert.equal(await stored('uiTransparency'),50);assert.equal(await stored('uiBlur'),false);
 for(const background of ['white','dark','pattern']){
  const buffer=Buffer.from(await page.evaluate(kind=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const c=canvas.getContext('2d');if(kind==='pattern'){for(let y=0;y<8;y++)for(let x=0;x<8;x++){c.fillStyle=['#000','#fff','#f00','#00f','#0f0'][(x+y)%5];c.fillRect(x*64,y*64,64,64);}}else{c.fillStyle=kind==='white'?'#fff':'#000';c.fillRect(0,0,512,512);}return canvas.toDataURL('image/png').split(',')[1];},background),'base64');
  const previousBackground=await page.locator('.page-background').evaluate(e=>e.style.backgroundImage);
  await page.getByLabel('Изменить фон',{exact:true}).setInputFiles({name:background+'.png',mimeType:'image/png',buffer});await expect(page.getByRole('button',{name:'Удалить фон',exact:true})).toBeVisible();await expect.poll(()=>page.locator('.page-background').evaluate(e=>e.style.backgroundImage)).not.toBe(previousBackground);
  const backgroundUrl=await page.locator('.page-background').evaluate(e=>e.style.backgroundImage);
  for(const alpha of [0,20,50])for(const blur of [false,true]){
   await set('Прозрачность (%)',alpha);await page.getByRole('checkbox',{name:'Размытие поверхностей',exact:true}).setChecked(blur);
   await expect(page.locator('.settings')).toHaveCSS('background-color',alpha===0?'rgb(255, 255, 255)':`rgba(255, 255, 255, ${1-alpha/100})`);
   await expect(page.locator('.settings')).toHaveCSS('backdrop-filter',blur?'blur(10px)':'none');
   assert.equal(await page.locator('.page-background').evaluate(e=>e.style.backgroundImage),backgroundUrl);await expect(textTile).toHaveCSS('background-color',tileColor);await expect(textTile).toHaveCSS('opacity','1');
   await expect(page.locator('.bookmark-title')).toHaveCSS('background-color',alpha===0?'rgb(255, 255, 255)':`rgba(255, 255, 255, ${1-alpha/100})`);
   await page.screenshot({path:resolve(out,`${background}-${alpha}-${blur?'blur':'clear'}.png`)});
  }
 }
 await page.setViewportSize({width:1280,height:600});
 await expect(page.locator('.page-background')).toHaveCSS('filter','blur(10px)');
 assert.equal(await page.locator('.page-background').evaluate(e=>getComputedStyle(e).transitionDuration),'0.25s, 0.25s');
 const headerBefore=await page.locator('.settings-header').boundingBox();
 await page.locator('.settings-content').evaluate(e=>e.scrollTop=e.scrollHeight);
 assert.equal((await page.locator('.settings-header').boundingBox()).y,headerBefore.y);
 const bounds=await page.locator('.settings-content').boundingBox();assert.ok(Math.abs(bounds.y-(headerBefore.y+headerBefore.height))<2);assert.ok(Math.abs(bounds.y+bounds.height-600)<2,JSON.stringify({bounds,headerBefore}));
 await page.getByRole('button',{name:'О настройке почты',exact:true}).hover();await expect(page.locator('#mail-settings-info')).toBeVisible();
 await page.getByRole('button',{name:'О настройке почты',exact:true}).click();await page.getByRole('button',{name:'Удалить фон',exact:true}).hover();await expect(page.locator('#mail-settings-info')).toBeHidden();
 await page.getByRole('checkbox',{name:'Размытие поверхностей',exact:true}).uncheck();await expect(page.locator('.page-background')).toHaveCSS('filter','none');await expect(page.locator('.dial')).toHaveCSS('filter','none');
 await page.getByRole('checkbox',{name:'Размытие поверхностей',exact:true}).check();await expect(page.locator('.page-background')).toHaveCSS('filter','blur(10px)');
 await page.setViewportSize({width:1280,height:900});
 await set('Цвет акцента','#3366cc');await close();
 const commands=[['page',['Новая закладка','Новая категория','Настройки']],['tile',['Открыть в новой вкладке','Изменить','Обновить эскиз','Удалить']],['category',['Изменить','Удалить']]];
 for(const width of [360,1280,1920]){await page.setViewportSize({width,height:900});const plus=await page.locator('.add-card svg').boundingBox(),card=await page.locator('.add-card').boundingBox();assert.ok(plus.width<=card.width&&plus.height<=card.height);for(const [kind,names]of commands){
  if(kind==='page')await page.locator('.page').click({button:'right',position:{x:width-4,y:880}});else if(kind==='tile')await textTile.click({button:'right'});else await page.getByRole('button',{name:'Appearance A',exact:true}).click({button:'right'});
  const menu=page.getByRole('menu');await expect(menu).toBeVisible();assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),names);
  const box=await menu.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=900);
  const row=menu.getByRole('menuitem').first();assert.ok((await row.boundingBox()).height>=36);await row.hover();const hover=await row.evaluate(e=>getComputedStyle(e).backgroundColor);assert.notEqual(hover,'rgb(255, 235, 160)');
  await menu.press('ArrowDown');await expect(row).toBeFocused();await expect(row).toHaveCSS('background-color',hover);await menu.screenshot({path:resolve(out,`${kind}-${width}.png`)});await page.keyboard.press('Escape');
 }await open();assert.equal(await page.locator('.settings').evaluate(e=>e.scrollWidth<=e.clientWidth),true);await close();}
 await open();for(const accent of ['#3366CC','#FFFFFF','#000000']){await set('Цвет акцента',accent);await expect.poll(()=>stored('uiAccent')).toBe(accent);const expectedInk=accent==='#FFFFFF'?'rgb(0, 0, 0)':'rgb(255, 255, 255)';await expect(page.locator('.ui-button:not(.danger) .ui-action-label').first()).toHaveCSS('color',expectedInk);await expect(page.locator('.ui-category[aria-pressed=true] .ui-action-label')).toHaveCSS('color',expectedInk);assert.equal(await page.locator('.checkmark').first().evaluate(e=>getComputedStyle(e,'::after').borderColor),expectedInk);assert.equal(await page.locator('.page').evaluate(e=>getComputedStyle(e).getPropertyValue('--ui-accent-contrast')),accent==='#FFFFFF'?'#000000':'#FFFFFF');}
 await close();await page.locator('.page').click({button:'right',position:{x:3,y:3}});await page.getByRole('menuitem',{name:'Новая закладка',exact:true}).click();await expect(page.locator('.modal')).toHaveCSS('border-top-left-radius','24px');await page.getByRole('button',{name:'Закрыть',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
 await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await open();await expect(page.locator('.settings')).toHaveCSS('animation-name','none');await expect(page.getByRole('button',{name:'Закрыть настройки',exact:true})).toBeVisible();await page.screenshot({path:resolve(out,'forced-colors.png')});await close();await page.emulateMedia({forcedColors:'none',reducedMotion:'no-preference'});
 await page.addStyleTag({content:'.ui-glass,.ui-caption{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'});await open();await expect(page.locator('.settings')).toHaveCSS('backdrop-filter','none');assert.notEqual(await page.locator('.settings').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');await close();
 await page.reload();await open();await expect(page.getByLabel('Скругление (px)',{exact:true})).toHaveValue('24');await expect(page.getByLabel('Цвет акцента',{exact:true})).toHaveValue('#000000');await close();
 await ctx.route('https://suggestqueries.google.com/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(['test',['test result']])}));await page.locator('.search select').selectOption('google');await page.locator('.search input').fill('test');await expect(page.locator('.suggestions')).toHaveCSS('border-top-left-radius','24px');await expect(page.locator('.search button')).toHaveCSS('background-color','rgb(66, 133, 244)');await expect(page.locator('.search input')).toHaveCSS('border-top-left-radius','0px');assert.deepEqual(errors,[]);
 console.log('PASS Chrome F06: migration, live preview/flush, radius, alpha/blur background matrix, unchanged image URLs and colored tiles, accent/reset, three menus/keyboard/edges, responsive UI, forced colors, reduced motion, no-blur fallback, persistence and provider branding');
}finally{await ctx.close();}
const driver=await launchFirefox();try{
 await driver.command('WebDriver:Navigate',{url:firefoxUrl});await driver.until('return !!document.querySelector(".page")&&!document.querySelector("button[aria-label=Настройки]").disabled;');await driver.exec('document.querySelector("button[aria-label=Настройки]").click();');await driver.until('return !!document.querySelector("input[type=number]");');
 await driver.exec('for(const [name,value]of [["Скругление (px)","12"],["Прозрачность (%)","50"],["Цвет акцента","#3366cc"]]){const input=Array.from(document.querySelectorAll(".settings input")).find(e=>e.getAttribute("aria-label")===name);input.value=value;input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));}');
 await driver.until('return getComputedStyle(document.querySelector(".settings")).borderTopLeftRadius==="12px";');
 await driver.exec(`document.querySelector('button[aria-label="Закрыть настройки"]').click();`);await driver.until('return !document.querySelector(".settings");');
 const preferences=await driver.exec('return (await browser.storage.local.get("settings")).settings.value;');assert.equal(preferences.uiRadius,12);assert.equal(preferences.uiTransparency,50);assert.equal(preferences.uiAccent,'#3366CC');
 await driver.exec('document.querySelector(".page").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:10,clientY:10}));');await driver.until('return !!document.querySelector(".context");');assert.equal(await driver.exec('return getComputedStyle(document.querySelector(".context")).borderTopLeftRadius;'),'12px');
 assert.equal(await driver.exec('return getComputedStyle(document.querySelector(".context")).backdropFilter;'),'blur(10px)');
 await driver.exec('for(const animation of document.getAnimations())animation.finish();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);');await writeFile(resolve(out,'firefox-menu.png'),Buffer.from(await driver.command('WebDriver:TakeScreenshot',{full:true}),'base64'));
 console.log('PASS Firefox F06: native controls, shared autosave, appearance tokens and context menu');
}finally{await driver.close();}
