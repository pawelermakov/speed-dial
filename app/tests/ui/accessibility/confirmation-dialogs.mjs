import { runSharedScenario } from '../../browser/helpers/extension-driver.mjs';
import assert from 'node:assert/strict';

import { resolve } from 'node:path';

async function check(name, { exec, until, key, resize, shot, hover, caseDone }) {
  await until(
    'return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;',
  );
  await exec(
    'window.api=globalThis.browser??chrome;window.errors=[];addEventListener("error",e=>errors.push(e.message));window.confirm=()=>{throw Error("Unexpected system confirmation");};const {rootFolderId}=await api.storage.local.get("rootFolderId");window.parityRoot=(await api.bookmarks.create({parentId:rootFolderId,title:"Confirmation test"})).id;window.target=(await api.bookmarks.create({parentId:parityRoot,title:"Delete me",url:"https://example.com/"})).id;window.folder=(await api.bookmarks.create({parentId:parityRoot,title:"Folder to delete"})).id;const deep=await api.bookmarks.create({parentId:folder,title:"Hidden"});window.descendant=(await api.bookmarks.create({parentId:deep.id,title:"Nested",url:"https://nested.example/"})).id;await api.storage.local.set({rootFolderId:parityRoot});',
  );
  await until(
    'return document.querySelector(".folder-root")?.textContent.trim()==="Confirmation test"&&document.querySelectorAll(".bookmark").length===1;',
  );
  const menuDelete = async (selector, label) => {
    await exec(
      'const e=document.querySelector(arguments[0]);e.focus();e.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:100,clientY:150}));',
      selector,
    );
    await until(
      'return document.activeElement?.getAttribute("role")==="menuitem"&&!document.activeElement.closest("[inert]");',
    );
    await exec(
      '[...document.querySelectorAll("[role=menuitem]")].find(e=>e.textContent.trim()===arguments[0]).click();',
      label,
    );
    await until(
      'return !!document.querySelector(".confirmation-dialog")&&document.activeElement.textContent.trim()==="Отмена"&&!document.querySelector(".modal-panel-enter-active");',
    );
  };
  const close = () => until('return !document.querySelector(".confirmation-dialog");');
  const confirm = () =>
    exec('document.querySelector(".confirmation-dialog button.danger").click();');
  for (const width of [360, 1280, 1920]) {
    await resize(width, 800);
    await exec('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));');
    await menuDelete('.bookmark', 'Удалить закладку');
    assert.equal(
      await exec(
        'const d=document.querySelector(".confirmation-dialog"),r=d.querySelector(".modal").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&d.scrollWidth<=innerWidth&&getComputedStyle(d.querySelector(".modal")).borderRadius==="24px"&&!!document.getElementById(d.getAttribute("aria-describedby"));',
      ),
      true,
    );
    assert.equal(
      await exec(
        'const primary=getComputedStyle(document.querySelector(".confirmation-dialog button.danger")),secondary=getComputedStyle(document.querySelector(".confirmation-dialog button[autofocus]"));return primary.backgroundColor!==secondary.backgroundColor&&secondary.backgroundColor==="rgb(255, 204, 0)"&&primary.color!==secondary.color;',
      ),
      true,
      'safe default uses the app accent and destructive text stays distinct',
    );
    await key('Tab');
    assert.equal(await exec('return document.activeElement.classList.contains("danger");'), true);
    await key('Tab');
    await key('Tab');
    assert.equal(
      await exec('return document.activeElement.textContent.trim();'),
      'Отмена',
      'Tab stays inside the confirmation',
    );
    await shot(width);
    const color = await exec(
      'return getComputedStyle(document.querySelector(".confirmation-dialog button.danger")).color;',
    );
    await hover('.confirmation-dialog button.danger');
    await exec('await new Promise(r=>setTimeout(r,200));');
    assert.deepEqual(
      await exec(
        'const s=getComputedStyle(document.querySelector(".confirmation-dialog button.danger"));return [s.color,s.backgroundColor];',
      ),
      [color, 'rgba(255, 255, 255, 0.58)'],
      'hover keeps destructive text readable on the shared input surface',
    );
    await shot(width + '-hover');
    await hover('.confirmation-dialog .panel-header');
    await key('Enter');
    await close();
    assert.equal(await exec('return document.querySelectorAll(".bookmark").length;'), 1);
    await until('return document.activeElement?.dataset.bookmarkId===target;');
  }
  await menuDelete('.bookmark', 'Удалить закладку');
  await key('Escape');
  await close();
  await menuDelete('.bookmark', 'Удалить закладку');
  await exec('document.querySelector(".confirmation-dialog .close").click();');
  await close();
  await menuDelete('.bookmark', 'Удалить закладку');
  await exec('document.querySelector(".confirmation-dialog").click();');
  await close();
  await exec(
    'window.originalRemove=api.bookmarks.remove;api.bookmarks.remove=async()=>{throw Error("Controlled delete failure");};',
  );
  await menuDelete('.bookmark', 'Удалить закладку');
  await confirm();
  await until(
    'return document.querySelector(".confirmation-dialog [role=alert]")?.textContent.includes("Controlled delete failure");',
  );
  assert.equal(await exec('return document.querySelectorAll(".bookmark").length;'), 1);
  await key('Escape');
  await close();
  await exec(
    'window.removeCalls=[];api.bookmarks.remove=id=>{removeCalls.push(id);return new Promise((resolve,reject)=>{window.releaseDelete=()=>originalRemove.call(api.bookmarks,id).then(resolve,reject);});};',
  );
  await menuDelete('.bookmark', 'Удалить закладку');
  await exec(
    'const e=document.querySelector(".confirmation-dialog button.danger");e.click();e.click();',
  );
  await until(
    'return typeof releaseDelete==="function"&&[...document.querySelectorAll(".confirmation-dialog button")].every(e=>e.disabled);',
  );
  await key('Escape');
  assert.equal(await exec('return !!document.querySelector(".confirmation-dialog");'), true);
  assert.equal(await exec('return removeCalls.length;'), 1);
  await exec('releaseDelete();');
  await close();
  await until('return !document.querySelector(".bookmark");');
  await exec('api.bookmarks.remove=originalRemove;');
  await menuDelete('.folder-tab', 'Удалить папку');
  assert.equal(
    await exec(
      'return document.querySelector(".confirmation-dialog").textContent.includes("скрытые вложенные папки");',
    ),
    true,
  );
  await confirm();
  await close();
  assert.equal(
    await exec('try{await api.bookmarks.get(descendant);return true;}catch{return false;}'),
    false,
  );
  assert.deepEqual(await exec('return errors;'), []);
  caseDone('confirmation-actions-and-artifacts');
  console.log(
    'PASS ' +
      name +
      ': native-style confirmations, Cancel default/Enter/Escape/close/backdrop, focus/Tab, 360/1280/1920, inline failure, busy/double-click, descendant deletion; data operations are covered by data-management',
  );
}

await runSharedScenario('confirmation-dialogs', check, {
  shotPath: (label, browser) =>
    resolve('.browser-test', 'confirmation-' + browser + '-' + label + '.png'),
});
