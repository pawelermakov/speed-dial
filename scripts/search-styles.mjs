import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const extension=resolve('.output/chrome-mv3');
const context=await chromium.launchPersistentContext(resolve('.browser-test/search-states-'+crypto.randomUUID()),{locale:'ru-RU',channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
try {
 await context.route('**://suggest.yandex.ru/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(['test',['First suggestion','Second suggestion']])}));
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const page=await context.newPage();
 await page.goto(worker.url().replace('background.js','newtab.html'));
 const search=page.locator('.search'),input=search.locator('input'),button=search.locator('.search-submit'),provider=search.locator('select');
 await expect(provider).toBeEnabled();
 for(const width of [320,360,700,1280]) {
  await page.setViewportSize({width,height:700});await input.fill('');await button.hover();
  await expect(button).toBeDisabled();await expect(button).toHaveCSS('background-color','rgb(226, 232, 240)');await expect(button).toHaveCSS('color','rgb(71, 85, 105)');await expect(button).toHaveCSS('cursor','not-allowed');await expect(button).toHaveCSS('box-shadow','none');
  await expect(search).toHaveCSS('height','48px');await expect(search).toHaveCSS('border-radius','24px');await expect(button).toHaveCSS('height','40px');await expect(button).toHaveCSS('border-radius','20px');const buttonBox=await button.boundingBox(),formBounds=await search.boundingBox();assert.equal(formBounds.x+formBounds.width-buttonBox.x-buttonBox.width,4);assert.equal(buttonBox.y-formBounds.y,4);
  if(width<=480){const iconBox=await button.locator('svg').boundingBox();assert.equal(iconBox.x+iconBox.width/2,buttonBox.x+buttonBox.width/2);assert.equal(iconBox.y+iconBox.height/2,buttonBox.y+buttonBox.height/2);}
  await input.fill('   ');await expect(button).toBeDisabled();
  await input.fill('test');await page.mouse.move(0,0);await expect(button).toBeEnabled();await expect(button).toHaveCSS('background-color','rgb(255, 204, 0)');
  await button.hover();await expect(button).toHaveCSS('background-color','rgb(242, 194, 0)');await expect(button).toHaveCSS('box-shadow','none');
  await page.mouse.down();await expect(button).toHaveCSS('background-color','rgb(230, 184, 0)');await page.mouse.move(0,0);await page.mouse.up();
  await input.click();await expect(input).toHaveCSS('outline-style','none');await page.keyboard.press('Tab');await expect(search.locator('.search-clear')).toBeFocused();await page.keyboard.press('Tab');await expect(button).toBeFocused();await button.hover();await expect(button).toHaveCSS('outline-width','2px');await expect(button).toHaveCSS('box-shadow','none');
  await expect(search.locator('.select-chevron')).toHaveCount(0);await expect(provider).toHaveCSS('padding-right','12px');await expect(provider).toHaveCSS('height','40px');await expect(provider).toHaveCSS('border-radius','20px');const providerBox=await provider.boundingBox(),searchBox=await search.boundingBox();assert.equal(providerBox.x-searchBox.x,4);assert.equal(providerBox.y-searchBox.y,4);
  await provider.hover();await expect(provider).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(provider).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');await expect(provider.locator('option')).toHaveCount(3);assert(await provider.evaluate(e=>{const s=getComputedStyle(e),c=document.createElement('canvas').getContext('2d');c.font=s.font;return Array.from(e.options).every(o=>c.measureText(o.text).width<=e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight))}),'provider names must fit without clipping');assert((await input.boundingBox()).width>80);
  await input.click();await expect(page.getByRole('option',{name:'First suggestion',exact:true})).toBeVisible();await page.keyboard.press('ArrowDown');await expect(page.locator('.suggestions li').first()).toHaveAttribute('aria-selected','true');await expect(page.locator('.suggestions li').first()).toHaveCSS('box-shadow','none');await expect(page.locator('.suggestions li').first()).toHaveCSS('background-color','rgba(255, 204, 0, 0.45)');await expect(page.locator('.suggestions')).toHaveCSS('border-radius','16px');await expect(page.locator('.suggestions')).toHaveCSS('backdrop-filter','blur(12px) saturate(1.6)');
  const box=await search.boundingBox();assert(box.x>=0&&box.x+box.width<=width);
  await search.screenshot({path:resolve('.browser-test/style-audit/main-search-'+width+'.png')});
 }
 await context.route('**://suggest.yandex.ru/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(['long',Array.from({length:8},(_,i)=>'Long suggestion '+i+' '+ 'long title '.repeat(15))])}));
 for(const width of [320,1280]) {
  await page.setViewportSize({width,height:400});
  for(const [name,background] of [['light','#fff'],['dark','#000'],['pattern','repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0/32px 32px']]) {
   await page.addStyleTag({content:'.page-background {opacity:1!important;background:'+background+'!important}'});
   await input.fill('long '+name);await input.click();const list=page.locator('.suggestions');await expect(list.locator('li')).toHaveCount(8);
   await expect(page.locator('.search-surface')).toHaveCSS('background-color','rgba(255, 255, 255, 0.86)');await expect(page.locator('.search-surface')).toHaveCSS('backdrop-filter','blur(12px)');await expect(search).toHaveCSS('backdrop-filter','none');await expect(input).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(input).toHaveCSS('backdrop-filter','none');
   await expect(list).toHaveCSS('background-color','rgba(255, 255, 255, 0.54)');await expect(list).toHaveCSS('backdrop-filter','blur(12px) saturate(1.6)');
   for(let i=0;i<8;i++)await page.keyboard.press('ArrowDown');
   const item=list.locator('[aria-selected=true]');await expect(input).toHaveAttribute('aria-activedescendant','suggestion-7');const row=await item.boundingBox(),bounds=await list.boundingBox();assert(row.y>=bounds.y&&row.y+row.height<=bounds.y+bounds.height+1,'selected suggestion must remain visible');assert(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=400);
   await expect(list).toHaveCSS('opacity','1');
   assert(await item.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'suggestion must be above folders');
   await page.screenshot({animations:'disabled',path:resolve('.browser-test/style-audit/search-suggestions-'+width+'-'+name+'.png')});
   await page.keyboard.press('Escape');await expect(list).toHaveCount(0);
  }
 }
 for(const [width,height] of [[320,180],[360,240],[1280,240]]) {
  await page.setViewportSize({width,height});await input.fill('short '+height);await input.click();const list=page.locator('.suggestions');await expect(list.locator('li')).toHaveCount(8);await expect(list).toHaveCSS('opacity','1');
  const bounds=await list.boundingBox(),form=await search.boundingBox();assert.equal(bounds.x,form.x);assert.equal(bounds.width,form.width);assert(bounds.y>=15&&bounds.y+bounds.height<=height-15,'dropdown must fit short viewport');
  await expect(list).toHaveCSS('padding','3px');await expect(list.locator('li').first()).toHaveCSS('border-radius','10px');await expect(list).toHaveCSS('box-shadow','rgba(12, 20, 34, 0.2) 0px 8px 28px 0px, rgba(255, 255, 255, 0.85) 0px 1px 1px 0px inset, rgba(255, 255, 255, 0.18) 0px -1px 0px 0px inset');
  const first=list.locator('li').first();await first.hover();await page.keyboard.press('ArrowDown');await expect(list.locator('[aria-selected=true]')).toHaveCount(1);await expect(first).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await page.mouse.move(0,height-1);await expect(list.locator('[aria-selected=true]')).toHaveCount(1);
  assert(await list.locator('[aria-selected=true]').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.right-12,r.y+r.height/2))}),'upward dropdown must be above tools');
  await page.screenshot({animations:'disabled',path:resolve('.browser-test/style-audit/search-short-'+width+'-'+height+'.png')});
  await page.keyboard.press('Escape');await expect(list).toHaveCount(0);await expect(input).not.toHaveAttribute('aria-controls','suggestions');
 }
 await page.setViewportSize({width:320,height:500});
 await context.route('**://suggest.yandex.ru/**',r=>r.fulfill({contentType:'application/json',body:'["empty",[]]'}));await input.fill('empty');await input.click();const feedback=search.getByRole('status');await expect(feedback).toHaveText('Нет подсказок');await expect(feedback).toHaveCSS('font-size','14px');await expect(feedback).toHaveCSS('border-radius','16px');let feedbackBox=await feedback.boundingBox(),formBox=await search.boundingBox();assert.equal(feedbackBox.x,formBox.x);assert.equal(feedbackBox.width,formBox.width);
 await context.route('**://suggest.yandex.ru/**',r=>r.fulfill({status:503,body:'unavailable'}));await input.fill('failure');await expect(feedback).toHaveText('Подсказки временно недоступны');await expect(button).toBeEnabled();await page.screenshot({animations:'disabled',path:resolve('.browser-test/style-audit/search-error.png')});
 await context.route('**://suggest.yandex.ru/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(['contrast',Array.from({length:8},(_,i)=>'Suggestion '+i)])}));
 await input.fill('contrast');await input.click();await expect(page.locator('.suggestions li')).toHaveCount(8);await page.keyboard.press('ArrowDown');
 await page.emulateMedia({forcedColors:'active'});const highlight=await page.evaluate(()=>{const e=document.createElement('span');e.style.backgroundColor='Highlight';document.body.append(e);const color=getComputedStyle(e).backgroundColor;e.remove();return color});await expect(page.locator('.suggestions [aria-selected=true]')).toHaveCSS('background-color',highlight);
 await page.emulateMedia({forcedColors:'none'});const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
 await expect(page.locator('.search-surface')).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(page.locator('.search-surface')).toHaveCSS('backdrop-filter','none');await expect(page.locator('.suggestions')).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(page.locator('.suggestions')).toHaveCSS('backdrop-filter','none');
 await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});await button.hover();await expect(button).toHaveCSS('transition-duration','0s');
 console.log('PASS search audit: geometry/radii/shadows/surfaces, disabled/hover/pressed/Tab, aligned suggestions/feedback, keyboard scrolling, single highlight, 180px-high viewport, 3 backgrounds, forced colors/reduced motion');
} finally {await context.close()}
