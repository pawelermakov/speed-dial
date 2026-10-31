import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { runSharedScenario } from '../../browser/helpers/extension-driver.mjs';
async function check(name, { exec, until, key, resize, screenshot, media, caseDone }) {
  await until(
    'return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;',
  );
  await exec(`window.api=globalThis.browser??globalThis.chrome;window.parityErrors=[];addEventListener('error',e=>parityErrors.push(e.message));addEventListener('unhandledrejection',e=>parityErrors.push(String(e.reason)));
 const {rootFolderId}=await api.storage.local.get('rootFolderId');window.parityRoot=(await api.bookmarks.create({parentId:rootFolderId,title:'Empty state'})).id;
 await api.storage.local.set({rootFolderId:parityRoot});`);
  await until(
    'return !!document.querySelector(".bookmark-empty .empty-state")&&document.querySelector(".folder-root")?.textContent.trim()==="Empty state";',
  );
  assert.equal(await exec('return document.querySelectorAll(".bookmark-empty button").length;'), 1);
  for (const width of [360, 1280, 1920]) {
    await resize(width, 800);
    for (const [kind, background] of [
      ['light', '#fff'],
      ['dark', '#000'],
      ['pattern', 'repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0/32px 32px'],
    ]) {
      await exec(
        'const e=document.querySelector(".page-background");e.style.opacity="1";e.style.background=arguments[0];',
        background,
      );
      assert.equal(
        await exec(
          'const e=document.querySelector(".bookmark-empty .empty-state"),r=e.getBoundingClientRect(),b=e.querySelector("button").getBoundingClientRect();return r.width<=441&&r.x>=0&&r.right<=innerWidth&&b.x>=r.x&&b.right<=r.right&&document.documentElement.scrollWidth<=innerWidth;',
        ),
        true,
      );
      assert.equal(
        await exec(
          'return getComputedStyle(document.querySelector(".empty-state button")).aspectRatio;',
        ),
        'auto',
      );
      await screenshot(name + '-' + width + '-' + kind);
    }
  }
  await exec('document.querySelector(".bookmark-empty button").focus();');
  await key('Enter');
  await until('return !!document.querySelector("#bookmark-url");');
  await key('Escape');
  await until(
    'return !document.querySelector("dialog")&&document.activeElement.matches(".bookmark-empty button");',
  );
  await exec(
    'await api.bookmarks.create({parentId:parityRoot,title:"Example",url:"https://example.test/"});',
  );
  await until(
    'return document.querySelectorAll(".bookmark").length===1&&!document.querySelector(".bookmark-empty");',
  );
  await exec(
    'const e=document.querySelector(".search select");e.value="bookmarks";e.dispatchEvent(new Event("change",{bubbles:true}));const input=document.querySelector(".search input");input.value="not-found";input.dispatchEvent(new Event("input",{bubbles:true}));',
  );
  await until('return !!document.querySelector(".bookmark-search-empty");');
  assert.equal(await exec('return document.querySelectorAll(".bookmark-empty").length;'), 0);
  assert.equal(
    await exec('return document.querySelector(".bookmark-search-empty").getAttribute("role");'),
    'status',
  );
  await screenshot(name + '-no-results');
  await exec('document.querySelector(".bookmark-search-empty button").focus();');
  await key('Enter');
  await until(
    'return !document.querySelector(".bookmark-search-empty")&&document.querySelectorAll(".bookmark").length===1&&document.activeElement===document.querySelector(".search input")&&document.activeElement.value==="";',
  );
  assert.equal(await exec('return document.querySelector(".search select").value;'), 'bookmarks');
  caseDone('empty-states-and-artifacts');
  // System accessibility modes apply to the shared surface and action.
  await exec('await api.bookmarks.create({parentId:parityRoot,title:"Empty child"});');
  await until('return !!document.querySelector(".folder-tab");');
  await exec('document.querySelector(".folder-tab").click();');
  await until('return !!document.querySelector(".bookmark-empty");');
  {
    await media({ forcedColors: 'active', reducedMotion: 'reduce' });
    await key('Tab');
    await exec('document.querySelector(".empty-state button").focus();');
    assert.equal(
      await exec(
        'return getComputedStyle(document.querySelector(".empty-state button")).outlineStyle;',
      ),
      'solid',
    );
    await screenshot(name + '-forced-colors');
    caseDone('empty-accessibility');
  }
  assert.deepEqual(await exec('return parityErrors;'), []);
  console.log(
    'PASS ' +
      name +
      ': empty folder and no-results hierarchy, responsive backgrounds, one action, keyboard dialog/clear and focus return',
  );
}

await runSharedScenario('empty-states', check, {
  shotPath: (label) => resolve('.browser-test/empty-' + label + '.png'),
});
