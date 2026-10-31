import { openData, captureBackup } from './data-management-helpers.mjs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchFirefox, firefoxUrl } from './firefox-driver.mjs';
const out = resolve('.browser-test/themes');
await mkdir(out, { recursive: true });
const luminance = (rgb) =>
  rgb
    .slice(0, 3)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
async function check(name, { exec, until, key, resize, reload, system, shot }) {
  await until(
    'return !!document.querySelector(".folder-root")&&!document.querySelector(".settings-trigger").disabled;',
  );
  await system('light');
  await until('return document.documentElement.dataset.theme==="light";');
  assert.equal(await exec('return document.documentElement.dataset.themeMode;'), 'system');
  await exec(
    'window.api=globalThis.browser??chrome;window.themeErrors=[];addEventListener("error",e=>themeErrors.push(e.message));addEventListener("unhandledrejection",e=>themeErrors.push(String(e.reason)));const {rootFolderId}=await api.storage.local.get("rootFolderId");window.themeRoot=(await api.bookmarks.create({parentId:rootFolderId,title:"Themes"})).id;window.colorTile=(await api.bookmarks.create({parentId:themeRoot,title:"Example",url:"https://example.com/"})).id;window.imageTile=(await api.bookmarks.create({parentId:themeRoot,title:"Image bookmark",url:"https://image.example/"})).id;await api.bookmarks.create({parentId:themeRoot,title:"Empty folder"});window.themeDB=await new Promise(resolve=>{const r=indexedDB.open("SpeedDialX");r.onsuccess=()=>resolve(r.result);});const blob=await (await fetch(api.runtime.getURL("images/icon128.png"))).blob();await new Promise((resolve,reject)=>{const tx=themeDB.transaction("tileAssets","readwrite");tx.objectStore("tileAssets").put({bookmarkId:imageTile,url:"https://image.example/",thumbnail:blob,favicon:blob});tx.oncomplete=resolve;tx.onerror=reject;});await api.storage.local.set({rootFolderId:themeRoot});',
  );
  await until(
    'return document.querySelector(".folder-root")?.textContent.trim()==="Themes"&&document.querySelectorAll(".bookmark").length===2;',
  );
  const open = async () => {
    await exec('document.querySelector(".settings-trigger").click();');
    await until(
      'return !!document.querySelector("#theme-mode")&&!document.querySelector(".settings-panel-enter-active");',
    );
  };
  const close = async () => {
    await key('Escape');
    await until('return !document.querySelector("dialog");');
  };
  const choose = async (mode, leave = false) => {
    if (!(await exec('return !!document.querySelector("#theme-mode");'))) await open();
    await exec(
      'const e=document.querySelector("#theme-mode");e.value=arguments[0];e.dispatchEvent(new Event("change",{bubbles:true}));',
      mode,
    );
    await until(
      'return (await api.storage.local.get("settings")).settings?.value.theme===document.querySelector("#theme-mode").value;',
    );
    if (!leave) await close();
  };
  const baseline = await exec(
    'return [...document.querySelectorAll(".bookmark")].map(e=>[e.dataset.bookmarkId,e.style.backgroundColor,!!e.style.backgroundImage]);',
  );
  await system('dark');
  await until('return document.documentElement.dataset.theme==="dark";');
  await choose('light');
  await system('light');
  await system('dark');
  assert.equal(await exec('return document.documentElement.dataset.theme;'), 'light');
  await choose('dark');
  await system('light');
  assert.equal(await exec('return document.documentElement.dataset.theme;'), 'dark');
  await reload();
  await until(
    // The startup mirror can set the theme before Vue mounts. A missing button
    // must not satisfy readiness through !undefined.
    'const trigger=document.querySelector(".settings-trigger");return !!trigger&&!trigger.disabled&&document.documentElement.dataset.theme==="dark"&&document.querySelector(".folder-root")?.textContent.trim()==="Themes"&&document.querySelectorAll(".bookmark").length===2;',
  );
  assert.equal(await exec('return localStorage.getItem("speed-dial-theme");'), 'dark');
  // Recreate only the test handles after a real reload.
  await exec(
    'window.api=globalThis.browser??chrome;window.themeErrors=[];addEventListener("error",e=>themeErrors.push(e.message));window.themeDB=await new Promise(resolve=>{const r=indexedDB.open("SpeedDialX");r.onsuccess=()=>resolve(r.result);});',
  );
  const wallpaper = async (kind) => {
    const before = await exec(
      'return document.querySelector(".page-background").style.backgroundImage;',
    );
    await exec(
      'const c=document.createElement("canvas");c.width=320;c.height=180;const g=c.getContext("2d");g.fillStyle=arguments[0]==="bright"?"#fff":arguments[0]==="dark"?"#101014":"#fff";g.fillRect(0,0,320,180);if(arguments[0]==="pattern"){g.fillStyle="#000";for(let y=0;y<180;y+=24)for(let x=0;x<320;x+=24)if((x/24+y/24)%2===0)g.fillRect(x,y,24,24);}const blob=await new Promise(r=>c.toBlob(r,"image/png"));window.wallpaperOriginal=await blob.arrayBuffer();await new Promise((resolve,reject)=>{const tx=themeDB.transaction("assets","readwrite");tx.objectStore("assets").put({key:"background",blob});tx.oncomplete=resolve;tx.onerror=reject;});const channel=new BroadcastChannel("speed-dial-updates");channel.postMessage({type:"updated",background:true});channel.close();',
      kind,
    );
    await until(
      'return document.querySelector(".page-background").style.backgroundImage!==' +
        JSON.stringify(before) +
        '&&getComputedStyle(document.querySelector(".page-background")).opacity==="1";',
    );
  };
  for (const kind of ['bright', 'dark', 'pattern']) {
    await wallpaper(kind);
    const wallpaperUrl = await exec(
      'return document.querySelector(".page-background").style.backgroundImage;',
    );
    for (const width of [360, 1280, 1920])
      for (const mode of ['light', 'dark']) {
        await resize(width, 900);
        await choose(mode);
        assert.equal(await exec('return document.documentElement.dataset.theme;'), mode);
        assert.equal(
          await exec('return document.querySelector(".page-background").style.backgroundImage;'),
          wallpaperUrl,
          'theme must not replace the wallpaper',
        );
        assert.equal(
          await exec('return getComputedStyle(document.querySelector(".page-background")).filter;'),
          'none',
        );
        assert.equal(
          await exec(
            'return getComputedStyle(document.querySelector(".page-background")).transitionDuration;',
          ),
          '0s',
          'wallpaper must appear without a fade',
        );
        assert.ok(
          (
            await exec('return getComputedStyle(document.documentElement).backgroundImage;')
          ).includes(mode === 'dark' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0)'),
          'cached preview keeps the same shade as the original',
        );
        const wallpaperPaint = await exec(
          'return getComputedStyle(document.querySelector(".page-background")).backgroundImage;',
        );
        assert.ok(
          wallpaperPaint.includes(mode === 'dark' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0)'),
          'wallpaper shade must follow the resolved theme',
        );
        assert.deepEqual(
          await exec(
            'return [...document.querySelectorAll(".bookmark")].map(e=>[e.dataset.bookmarkId,e.style.backgroundColor,!!e.style.backgroundImage]);',
          ),
          baseline,
          'tile colours and images must remain unchanged',
        );
        assert.equal(await exec('return document.documentElement.scrollWidth<=innerWidth;'), true);
        await shot(name + '-' + width + '-' + mode + '-' + kind + '-page');
        await open();
        await exec(
          'document.querySelector("#theme-mode").scrollIntoView({block:"center"});document.querySelector("#theme-mode").focus();',
        );
        assert.equal(
          await exec(
            'const r=document.querySelector("#theme-mode").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=40;',
          ),
          true,
        );
        await shot(name + '-' + width + '-' + mode + '-' + kind + '-settings');
        await close();
      }
    assert.equal(
      await exec(
        'const blob=await new Promise(resolve=>{const r=themeDB.transaction("assets").objectStore("assets").get("background");r.onsuccess=()=>resolve(r.result.blob);});return String(new Uint8Array(await blob.arrayBuffer()))===String(new Uint8Array(wallpaperOriginal));',
      ),
      true,
    );
  }
  for (const mode of ['light', 'dark']) {
    await resize(1280, 900);
    await choose(mode);
    // Read rendered placeholder and control colours instead of testing colour literals.
    const control = await exec(
      'const rgb=s=>(s.match(/[0-9.]+/g)||[]).map(Number);return {text:rgb(getComputedStyle(document.querySelector(".search input"),"::placeholder").color),surface:rgb(getComputedStyle(document.querySelector(".search-surface")).backgroundColor)};',
    );
    const alpha = control.surface[3] ?? 1;
    const backdrop = mode === 'light' ? 0 : 255;
    const surface = control.surface.slice(0, 3).map((v) => v * alpha + backdrop * (1 - alpha));
    const textLight = luminance(control.text),
      surfaceLight = luminance(surface);
    assert.ok(
      (Math.max(textLight, surfaceLight) + 0.05) / (Math.min(textLight, surfaceLight) + 0.05) >=
        4.5,
      `${name} ${mode}: search placeholder must reach 4.5:1 on the least favourable wallpaper`,
    );
    await exec(
      'document.querySelector(".bookmark").focus();document.querySelector(".bookmark").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:200,clientY:200}));',
    );
    await until(
      'return document.activeElement?.getAttribute("role")==="menuitem"&&!document.querySelector(".floating-enter-active");',
    );
    await until('return getComputedStyle(document.activeElement).color==="rgb(23, 33, 47)";');
    await shot(name + '-' + mode + '-menu');
    await exec(
      '[...document.querySelectorAll("[role=menuitem]")].find(e=>e.textContent.trim()==="Изменить закладку").click();',
    );
    await until(
      'return !!document.querySelector("#bookmark-url")&&!document.querySelector(".modal-panel-enter-active");',
    );
    if (mode === 'dark') {
      const audit = await exec(
        'const modal=document.querySelector(".modal"),panel=document.querySelector(".search-surface"),probe=document.createElement("span");probe.style.color="var(--text-secondary)";modal.appendChild(probe);const rgb=s=>(s.match(/[0-9.]+/g)||[]).map(Number);const result={text:rgb(getComputedStyle(probe).color),modal:rgb(getComputedStyle(modal).backgroundColor),control:rgb(getComputedStyle(panel).backgroundColor)};probe.remove();return result;',
      );
      const background = audit.modal
        .slice(0, 3)
        .map(
          (v) =>
            (v * (audit.modal[3] ?? 1) + 255 * (1 - (audit.modal[3] ?? 1))) * 0.94 + 255 * 0.06,
        );
      assert.ok(
        luminance(audit.modal) > luminance(audit.control),
        'raised modal must be lighter than base controls',
      );
      assert.ok(
        (luminance(audit.text) + 0.05) / (luminance(background) + 0.05) >= 7,
        'secondary text must reach 7:1 over the brightest glass region',
      );
    }
    await shot(name + '-' + mode + '-bookmark');
    await close();
    await exec('document.querySelector(".folder-tab").click();');
    await until('return !!document.querySelector(".empty-state");');
    await shot(name + '-' + mode + '-empty');
    await exec('document.querySelector(".folder-root").click();');
    await until('return document.querySelectorAll(".bookmark").length===2;');
  }
  await choose('system');
  await system('dark');
  await until('return document.documentElement.dataset.theme==="dark";');
  await system('light');
  await until('return document.documentElement.dataset.theme==="light";');
  await openData(exec, until);
  assert.equal((await captureBackup(exec, until)).settings.theme, 'system');
  await key('Escape');
  await until('return !document.querySelector(".data-management");');
  await close();
  assert.deepEqual(await exec('return themeErrors;'), []);
  console.log(
    'PASS ' +
      name +
      ': theme persistence, native OS changes, explicit overrides, JSON v3, unchanged tiles/wallpaper bytes, light/dark/pattern backgrounds, 360/1280/1920 and modal/menu/empty screenshots',
  );
}
if (!process.argv.includes('--firefox-only')) {
  const extension = resolve('.output/chrome-mv3'),
    ctx = await chromium.launchPersistentContext(
      resolve('.browser-test/themes-chrome-' + crypto.randomUUID()),
      {
        locale: 'ru-RU',
        channel: 'chromium',
        headless: true,
        colorScheme: 'light',
        args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
      },
    );
  try {
    const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker')),
      page = await ctx.newPage();
    await page.goto(worker.url().replace('background.js', 'newtab.html'));
    const exec = (body, ...args) =>
      page.evaluate(
        new Function('args', 'return (async function(){' + body + '}).apply(null,args)'),
        args,
      );
    await check('chrome', {
      exec,
      until: async (body) => {
        const start = Date.now();
        while (!(await exec(body))) {
          if (Date.now() - start > 15000) throw Error(body);
          await new Promise((r) => setTimeout(r, 100));
        }
      },
      key: (value) => page.keyboard.press(value),
      resize: (width, height) => page.setViewportSize({ width, height }),
      reload: () => page.reload(),
      system: (value) => page.emulateMedia({ colorScheme: value }),
      shot: (label) => page.screenshot({ path: resolve(out, label + '.png') }),
    });
  } finally {
    await ctx.close();
  }
}
if (!process.argv.includes('--chrome-only')) {
  const ff = await launchFirefox();
  const system = async (mode) => {
    await ff.command('Marionette:SetContext', { value: 'chrome' });
    try {
      await ff.exec(
        'Services.prefs.setIntPref("layout.css.prefers-color-scheme.content-override",arguments[0]);',
        mode === 'dark' ? 0 : 1,
      );
    } finally {
      await ff.command('Marionette:SetContext', { value: 'content' });
    }
    await ff.until(
      'return matchMedia("(prefers-color-scheme:dark)").matches===' + String(mode === 'dark') + ';',
    );
  };
  try {
    await ff.command('WebDriver:Navigate', { url: firefoxUrl });
    await check('firefox', {
      ...ff,
      system,
      key: async (value) => {
        const code = { Escape: '\uE00C', Tab: '\uE004', Enter: '\uE006' }[value] ?? value;
        await ff.command('WebDriver:PerformActions', {
          actions: [
            {
              type: 'key',
              id: 'keyboard',
              actions: [
                { type: 'keyDown', value: code },
                { type: 'keyUp', value: code },
              ],
            },
          ],
        });
      },
      resize: (width, height) => ff.command('WebDriver:SetWindowRect', { width, height }),
      reload: () => ff.command('WebDriver:Refresh', {}),
      shot: async (label) =>
        writeFile(
          resolve(out, label + '.png'),
          Buffer.from(await ff.command('WebDriver:TakeScreenshot', {}), 'base64'),
        ),
    });
  } finally {
    await ff.close();
  }
}
