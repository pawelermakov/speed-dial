// Keyboard and pointer focus appearance in the production Chromium extension.
import {chromium,expect} from '@playwright/test';
import {resolve} from 'node:path';
const extension=resolve('.output/chrome-mv3');
const context=await chromium.launchPersistentContext(resolve('.browser-test/focus-'+crypto.randomUUID()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
try {
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const page=await context.newPage();
 await context.route('**://suggest.yandex.ru/**',r=>r.fulfill({contentType:'application/json',body:'["test",[]]'}));
 await page.goto(worker.url().replace('background.js','newtab.html'));
 const gear=page.getByRole('button',{name:'Настройки',exact:true}),search=page.locator('.search'),input=search.locator('input');
 await expect(gear).toBeEnabled();
 await input.click();await input.fill('test');
 await expect(input).toHaveCSS('outline-style','none');await expect(search).toHaveCSS('outline-style','none');
 await page.keyboard.press('Tab');await expect(search.locator('.search-clear')).toBeFocused();
 await expect(search).toHaveCSS('outline-style','none');await expect(search.locator('.search-clear')).toHaveCSS('outline-width','2px');await expect(search.locator('.search-clear')).toHaveCSS('box-shadow','none');
 await page.keyboard.press('Tab');await expect(search.locator('.search-submit')).toBeFocused();await expect(search.locator('.search-submit')).toHaveCSS('outline-width','2px');await page.keyboard.press('Shift+Tab');await expect(search.locator('.search-clear')).toBeFocused();
 await page.keyboard.press('Shift+Tab');await expect(input).toBeFocused();await expect(search).toHaveCSS('outline-style','none');await expect(input).toHaveCSS('outline-width','2px');
 await page.keyboard.press('Shift+Tab');await expect(search.locator('select')).toBeFocused();await expect(search).toHaveCSS('outline-style','none');await expect(search.locator('select')).toHaveCSS('outline-width','2px');
 await gear.focus();await expect(gear).toHaveCSS('outline-width','2px');await expect(gear).toHaveCSS('outline-color','rgb(82, 100, 122)');await expect(search).toHaveCSS('outline-style','none');
 await page.mouse.click(4,4);await expect(gear).toHaveCSS('outline-style','none');
 await page.keyboard.press('Tab');await expect(page.locator('.page')).toHaveAttribute('data-keyboard-focus','true');
 const local=page.getByRole('button',{name:'Поиск по закладкам',exact:true});await local.click();
 await expect(page.locator('.bookmark-search-field')).toHaveCSS('outline-style','none');await expect(page.getByRole('searchbox')).toHaveCSS('outline-style','none');
 await page.keyboard.press('Tab');const close=page.getByRole('button',{name:'Закрыть поиск по закладкам',exact:true});await expect(close).toBeFocused();await expect(page.locator('.bookmark-search-field')).toHaveCSS('outline-style','none');await expect(close).toHaveCSS('outline-width','2px');
 await close.click();await expect(local).toBeFocused();await expect(page.locator('.bookmark-search-field')).toHaveCSS('outline-style','none');
 await page.keyboard.press('Tab');await page.locator('.folder-root').focus();await expect(page.locator('.folder-root')).toHaveCSS('outline-offset','-3px');await expect(page.locator('.folder-root')).toHaveCSS('box-shadow','none');
 await gear.click();await expect(page.locator('.settings')).toBeVisible();
 await page.keyboard.press('Tab');const toggle=page.getByRole('switch').first();await toggle.focus();await expect(toggle.locator('xpath=following-sibling::span')).toHaveCSS('outline-width','2px');
 await page.emulateMedia({forcedColors:'active'});const settingsClose=page.getByRole('button',{name:'Закрыть настройки',exact:true});await settingsClose.focus();await expect(settingsClose).toHaveCSS('outline-width','2px');
 console.log('PASS pointer/keyboard focus, thin individual focus outlines, local search, switches and forced colors');
} finally {await context.close()}
