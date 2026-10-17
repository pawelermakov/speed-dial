import assert from 'node:assert/strict';
import { launchFirefox, firefoxUrl } from './firefox-driver.mjs';
export async function firefoxSmoke(siteUrl, results) {
 const driver = await launchFirefox();
 try {
  await driver.command('WebDriver:Navigate',{url:firefoxUrl});
  await driver.until('return !!document.querySelector(".page") && !document.querySelector("button[aria-label=Настройки]").disabled;');
  const rootId = await driver.exec('const tree=await browser.bookmarks.getTree(); const parent=tree[0].children.find(node=>!node.unmodifiable && !node.url); const root=await browser.bookmarks.create({parentId:parent.id,title:"Speed Dial"}); await browser.storage.local.set({rootFolderId:root.id}); return root.id;');
  await driver.command('WebDriver:Refresh');
  await driver.until('return !!document.querySelector(".add-card, .empty-state");');
  const click = text => driver.exec('Array.from(document.querySelectorAll("button")).find(button=>button.textContent.trim()===arguments[0] || button.getAttribute("aria-label")===arguments[0]).click();',text);
  await click('Новая закладка');
  await driver.until('return !!document.querySelector("dialog input");');
  await driver.exec('const inputs=document.querySelectorAll("dialog input"); inputs[0].value=arguments[0];inputs[1].value="Firefox custom";for(const input of inputs)input.dispatchEvent(new Event("input",{bubbles:true}));',siteUrl);
  await click('Добавить'); await driver.until('return document.querySelectorAll(".bookmark").length===1 && !document.querySelector("dialog");');
  const id = await driver.exec('return (await browser.bookmarks.getChildren(arguments[0]))[0].id;',rootId);
  assert.equal(await driver.exec('return (await browser.bookmarks.get(arguments[0]))[0].title;',id),'Firefox custom');
  await driver.exec('document.querySelector(".bookmark").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:30,clientY:100}));'); await click('Обновить эскиз');
  await driver.until('return document.querySelector(".notice")?.textContent.includes("Изображения обновлены");',30000);
  assert.equal(await driver.exec('return (await browser.bookmarks.get(arguments[0]))[0].title;',id),'Firefox custom');
  results.push('firefox: real UI create, browser source, capture and custom title preservation');
  const category = await driver.exec('const category=await browser.bookmarks.create({parentId:arguments[0],title:"Work"});await browser.bookmarks.move(arguments[1],{parentId:category.id});return category.id;',rootId,id);
  await driver.until('return Array.from(document.querySelectorAll("nav button")).some(button=>button.textContent==="Work") && document.querySelectorAll(".bookmark").length===1;');
  await driver.exec('await browser.bookmarks.update(arguments[0],{title:"External Firefox"});',id);
  await driver.until('return document.querySelector(".bookmark")?.textContent.includes("External Firefox");');
  await driver.exec('document.querySelector(".bookmark").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:30,clientY:100}));'); await click('Изменить');
  await driver.exec('const input=document.querySelectorAll("dialog input")[1];input.value="Edited Firefox";input.dispatchEvent(new Event("input",{bubbles:true}));'); await click('Сохранить');
  await driver.until('return !document.querySelector("dialog") && document.querySelector(".bookmark")?.textContent.includes("Edited Firefox");');
  await driver.exec('await browser.bookmarks.removeTree(arguments[0]);',category);
  await driver.until('return document.querySelectorAll(".bookmark").length===0;');
  results.push('firefox: category transfer, external change, UI edit and external category removal');
  await driver.exec('document.querySelector("button[aria-label=Настройки]").click();');
  await driver.until('return document.querySelector(".settings")?.textContent.includes("Статус синхронизации недоступен в Firefox");');
  await driver.exec('window.confirm=()=>true;'); await click('Сбросить настройки и кэш');
  assert.ok((await driver.exec('return (await browser.bookmarks.get(arguments[0]))[0].id;',rootId))===rootId);
  await driver.exec('await browser.bookmarks.removeTree(arguments[0]);',rootId);
  await driver.until('return !!document.querySelector(".bookmark-area").textContent.includes("Выберите или создайте");');
  results.push('firefox: unsupported Sync, safe reset and deleted root setup');
 } finally { await driver.close(); }
}
