import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
const out=resolve('.browser-test/design-system-consistency');await mkdir(out,{recursive:true});const extension=resolve('.output/chrome-mv3');
const context=await chromium.launchPersistentContext(resolve(out,crypto.randomUUID()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
try {
 await context.route('**://suggest.yandex.ru/**',r=>r.fulfill({contentType:'application/json',body:'["test",["Example suggestion"]]'}));
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(worker.url().replace('background.js','newtab.html'));await expect(page.locator('.folder-root')).toBeEnabled();
 const selectSignatures=[],glassSignatures=[];
 const glass=async locator=>{await expect(locator).toHaveCSS('opacity','1');glassSignatures.push(await locator.evaluate(e=>{const s=getComputedStyle(e);return[s.backgroundColor,s.backgroundImage,s.backdropFilter,s.borderTopColor]}));};
 const checkSelect=async locator=>{
  const embedded=await locator.evaluate(e=>e.parentElement.classList.contains('ui-select--embedded'));const resting=embedded?'rgba(0, 0, 0, 0)':'rgba(255, 255, 255, 0.46)';
  await locator.evaluate(e=>e.blur());await page.mouse.move(1,1);await expect(locator).toHaveCSS('background-color',resting);await locator.hover();await expect(locator).toHaveCSS('background-color',resting);
  if(embedded){await expect(locator.locator('..').locator('.select-chevron')).toHaveCount(0);await expect(locator).toHaveCSS('padding-right','12px');await expect(locator).toHaveCSS('height','40px');await expect(locator).toHaveCSS('border-radius','20px');}else{
  await expect(locator).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');
  const arrow=locator.locator('..').locator('.select-chevron');await expect(arrow).toHaveCSS('width','16px');await expect(arrow).toHaveCSS('pointer-events','none');
  selectSignatures.push(await locator.evaluate(e=>{const s=getComputedStyle(e),a=getComputedStyle(e.nextElementSibling);return[s.height,s.borderRadius,s.borderTopWidth,s.paddingLeft,s.paddingRight,s.color,s.appearance,a.width,a.height,a.right,a.color,e.nextElementSibling.getAttribute('stroke-width'),e.nextElementSibling.querySelector('path').getAttribute('d')]}));
  }
  await locator.focus();await expect(locator).toHaveCSS('background-color','rgba(255, 255, 255, 0.58)');await expect(locator).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');await locator.evaluate(e=>e.disabled=true);await expect(locator).toHaveCSS('background-color','rgb(226, 232, 240)');await locator.evaluate(e=>e.disabled=false);await locator.evaluate(e=>e.blur());
 };
 for(const width of [320,1280]){
  await page.setViewportSize({width,height:800});await checkSelect(page.getByRole('combobox',{name:'Где искать',exact:true}));
  await page.getByRole('button',{name:'Настройки',exact:true}).click();await glass(page.locator('.settings'));await expect(page.locator('.settings .ui-file-button')).toHaveCSS('border-radius','20px');await checkSelect(page.locator('.settings select'));
  await expect(page.locator('.settings input[type=email]')).toHaveCSS('background-color','rgba(255, 255, 255, 0.46)');await page.locator('.settings input[type=email]').focus();await expect(page.locator('.settings input[type=email]')).toHaveCSS('background-color','rgba(255, 255, 255, 0.58)');
  assert.equal(await page.locator('.settings').evaluate(e=>e.scrollWidth>e.clientWidth),false);assert(await page.locator('.settings-form>fieldset').evaluateAll(rows=>rows.every(e=>{const line=getComputedStyle(e.querySelector('legend'),'::before');return line.content!== 'none'&&line.top==='-16px'&&-parseFloat(line.top)-parseFloat(line.height)>=12})), 'section divider must be separated from its legend');await page.screenshot({animations:'disabled',path:resolve(out,`${width}-settings.png`)});
  await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();await expect(page.locator('.settings')).toHaveCount(0);
  await page.locator('.page').click({button:'right',position:{x:(await page.locator('.page').boundingBox()).width-2,y:798}});await glass(page.getByRole('menu'));await page.getByRole('menuitem').first().hover();await expect(page.getByRole('menuitem').first()).toHaveCSS('background-color','rgba(255, 204, 0, 0.45)');await page.getByRole('menuitem',{name:'Новая закладка',exact:true}).click();await glass(page.locator('.modal'));await checkSelect(page.locator('.modal select'));
  await page.getByRole('button',{name:'О создании эскиза',exact:true}).click();await glass(page.getByRole('tooltip'));await page.getByRole('button',{name:'О создании эскиза',exact:true}).press('Escape');await page.screenshot({animations:'disabled',path:resolve(out,`${width}-modal.png`)});
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  const input=page.locator('.search input');await input.fill('test');await input.focus();await glass(page.locator('.suggestions'));await input.blur();await input.fill('');
 }
 for(const signature of selectSignatures)assert.deepEqual(signature,selectSignatures[0],'standalone selects must share geometry, arrow and typography');
 for(const signature of glassSignatures)assert.deepEqual(signature,glassSignatures[0],'settings, dialogs, menus, tooltips and suggestions must share the glass material');
 await page.getByRole('button',{name:'Настройки',exact:true}).click();const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});await expect(page.locator('.settings')).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(page.locator('.settings')).toHaveCSS('backdrop-filter','none');
 await cdp.send('Emulation.setEmulatedMedia',{features:[]});await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await expect(page.locator('.settings select')).toHaveCSS('transition-duration','0s');await expect(page.locator('.settings')).toHaveCSS('backdrop-filter','none');assert.deepEqual(errors,[]);
 console.log('PASS global consistency: standalone selects share chevrons; embedded provider has no chevron; all selects support focus/disabled; settings/dialogs/menus/tooltips/suggestions share glass; 320/1280 and accessibility modes');
} finally {await context.close()}
