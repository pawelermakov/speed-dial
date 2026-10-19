import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { createHash, createPublicKey } from 'node:crypto';

const output=resolve('.browser-test/sync');
await mkdir(output,{recursive:true});
const run=crypto.randomUUID();
const source=resolve('.output/chrome-mv3');
const manifest=JSON.parse(await readFile(resolve(source,'manifest.json'),'utf8'));
const firefox=JSON.parse(await readFile('.output/firefox-mv2/manifest.json','utf8'));
assert.equal(firefox.key,undefined);
createPublicKey({key:Buffer.from(manifest.key,'base64'),format:'der',type:'spki'});
const expectedId=[...createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest().subarray(0,16)].map(v=>String.fromCharCode(97+(v>>4),97+(v&15))).join('');
const copies=await Promise.all(['a','b'].map(async name=>{
 const directory=resolve(output,`unpacked-${name}-${run}`);
 await cp(source,directory,{recursive:true});
 const context=await chromium.launchPersistentContext(resolve(output,`profile-${name}-${run}`),{channel:'chromium',headless:true,args:['--disable-extensions-except='+directory,'--load-extension='+directory]});
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const id=await worker.evaluate(()=>chrome.runtime.id);
 assert.equal(id,expectedId);
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.bookmarkWrites=[];
  for(const key of ['create','update','move','remove','removeTree']){
   const original=chrome.bookmarks[key];
   chrome.bookmarks[key]=(...args)=>{window.bookmarkWrites.push(key);return original.apply(chrome.bookmarks,args);};
  }
 });
 await page.goto(`chrome-extension://${id}/newtab.html`);
 await expect(page.getByRole('button',{name:'Настройки',exact:true})).toBeEnabled();
 return{context,worker,page,id,directory,errors};
}));
const [a,b]=copies;
const open=async page=>{const button=page.getByRole('button',{name:'Настройки',exact:true});await expect(button).toBeEnabled();await button.focus();await button.press('Enter');await expect(page.getByLabel('Ширина (%)',{exact:true})).toBeEnabled();};
const close=async page=>{await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();await expect(page.locator('.settings')).toHaveCount(0);};
const cloud=worker=>worker.evaluate(()=>chrome.storage.sync.get(null));
try{
 assert.equal(a.id,b.id);assert.notEqual(a.directory,b.directory);
 assert.deepEqual(await cloud(a.worker),{});assert.deepEqual(await cloud(b.worker),{});
 console.log('PASS same actual runtime ID from two independent unpacked directories; Firefox excludes key; clean profiles do not upload defaults');

 await open(a.page);await a.page.getByLabel('Ширина (%)',{exact:true}).fill('80');await close(a.page);
 await expect.poll(()=>cloud(a.worker)).toEqual({'settings.v1.width':80});
 // Deterministic delivery fixture, not a claim of real Google cloud transport.
 await b.worker.evaluate(values=>chrome.storage.sync.set(values),await cloud(a.worker));
 await open(b.page);await expect(b.page.getByLabel('Ширина (%)',{exact:true})).toHaveValue('80');
 await b.page.getByLabel('Расстояние (px)',{exact:true}).fill('12');await close(b.page);
 await expect.poll(()=>cloud(b.worker)).toEqual({'settings.v1.width':80,'settings.v1.space':12});
 await a.worker.evaluate(values=>chrome.storage.sync.set(values),await cloud(b.worker));
 await open(a.page);await expect(a.page.getByLabel('Расстояние (px)',{exact:true})).toHaveValue('12');

 await a.page.getByLabel('E-mail Mail.ru',{exact:true}).fill('draft@mail.ru');
 await a.worker.evaluate(()=>chrome.storage.sync.set({'settings.v1.email':'remote@mail.ru','settings.v1.uiAccent':'#123456','settings.v1.uiRadius':12}));
 await expect(a.page.getByLabel('E-mail Mail.ru',{exact:true})).toHaveValue('draft@mail.ru');
 await expect(a.page.getByLabel('E-mail Mail.ru',{exact:true})).toBeFocused();
 await close(a.page);await expect.poll(async()=>(await cloud(a.worker))['settings.v1.email']).toBe('draft@mail.ru');
 console.log('PASS sparse field writes, controlled cross-profile delivery, remote live UI updates and focused input preservation');

 const peer=await a.context.newPage();await peer.goto(a.page.url());await open(peer);
 await a.worker.evaluate(()=>chrome.storage.sync.set({'settings.v1.width':85}));
 await expect(peer.getByLabel('Ширина (%)',{exact:true})).toHaveValue('85');
 await close(peer);await peer.close();

 await a.worker.evaluate(()=>{const original=chrome.storage.sync.set;globalThis.restoreSync=()=>chrome.storage.sync.set=original;chrome.storage.sync.set=async()=>{throw Error('QUOTA_BYTES fixture');};});
 await open(a.page);await a.page.getByLabel('Ширина (%)',{exact:true}).fill('90');await close(a.page);await open(a.page);
 await expect(a.page.getByRole('region',{name:'Синхронизация'}).getByRole('alert')).toContainText('локально');
 assert.equal(await a.page.evaluate(async()=>(await chrome.storage.local.get('settings')).settings.value.width),90);
 await expect(a.page.getByRole('button',{name:'Повторить',exact:true})).toBeEnabled();
 await a.worker.evaluate(()=>globalThis.restoreSync());
 await a.page.getByRole('button',{name:'Повторить',exact:true}).click();
 await expect.poll(async()=>(await cloud(a.worker))['settings.v1.width']).toBe(90);
 await expect(a.page.getByRole('region',{name:'Синхронизация'}).getByRole('alert')).toHaveCount(0);
 console.log('PASS real API failure preserves local settings; explicit retry clears warning and writes queued value');

 const selected=await a.page.evaluate(async()=>{
  const {rootFolderId}=await chrome.storage.local.get('rootFolderId');
  return chrome.bookmarks.create({parentId:rootFolderId,title:'Portable test folder'});
 });
 await expect(a.page.getByLabel('Папка закладок',{exact:true})).toBeEnabled();
 await a.page.getByLabel('Папка закладок',{exact:true}).selectOption(selected.id);await close(a.page);
 await expect.poll(async()=>(await cloud(a.worker))['selectedFolder.v1']).toBeTruthy();
 let locator=(await cloud(a.worker))['selectedFolder.v1'];
 assert.equal(locator.version,1);assert.deepEqual(locator.path,['Portable test folder']);assert.equal('id' in locator,false);
 await a.worker.evaluate(id=>chrome.bookmarks.update(id,{title:'Renamed portable folder'}),selected.id);
 await expect.poll(async()=>(await cloud(a.worker))['selectedFolder.v1'].path).toEqual(['Renamed portable folder']);
 locator=(await cloud(a.worker))['selectedFolder.v1'];
 await a.worker.evaluate(id=>chrome.bookmarks.removeTree(id),selected.id);
 await expect.poll(()=>a.page.evaluate(async()=>(await chrome.storage.local.get('rootFolderId')).rootFolderId)).not.toBe(selected.id);
 assert.deepEqual((await cloud(a.worker))['selectedFolder.v1'],locator);
 assert.deepEqual(await a.page.evaluate(()=>window.bookmarkWrites),['create']); // Only explicit fixture creation in page context.
 console.log('PASS portable locator uses raw titles, follows rename, never publishes deleted-folder fallback; no implicit bookmark mutations');

 await open(a.page);
 await a.page.evaluate(()=>{chrome.permissions.contains=async()=>true;chrome.identity.getProfileUserInfo=async()=>({id:'fixture-only',email:'a-very-long-test-account-address@example.invalid'});});
 await close(a.page);await open(a.page);
 const region=a.page.getByRole('region',{name:'Синхронизация'});
 await expect(region.getByRole('status')).toHaveText('Включена');
 await expect(region.locator('.sync-email')).toHaveAttribute('title','a-very-long-test-account-address@example.invalid');
 await expect(region.getByText('Аккаунт Google',{exact:true})).toHaveCount(0);
 await expect(region.locator('.sync-email')).toHaveCSS('font-weight','400');
 for(const width of [360,1280]){
  await a.page.setViewportSize({width,height:900});
  assert.equal(await a.page.locator('.settings').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  await a.page.getByRole('button',{name:'О синхронизации',exact:true}).hover();
  await expect(a.page.locator('#sync-info')).toBeVisible();await expect(a.page.locator('#sync-info')).toHaveCSS('opacity','1');
  const bounds=await a.page.locator('#sync-info').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
  await a.page.locator('.settings').screenshot({path:resolve(output,`tooltip-${width}.png`)});
  await a.page.getByRole('heading',{name:'Настройки',exact:true}).hover();await expect(a.page.locator('#sync-info')).toBeHidden();
  await a.page.locator('.settings').screenshot({path:resolve(output,`panel-${width}.png`)});
 }
 const infoButton=a.page.getByRole('button',{name:'О синхронизации',exact:true});
 await infoButton.focus();
 await expect(infoButton).toBeFocused();await expect(a.page.locator('#sync-info')).toBeVisible();
 await infoButton.press('Tab');await expect(a.page.locator('#sync-info')).toBeHidden();
 await expect(region.getByRole('button',{name:'Повторить',exact:true})).toHaveCount(0);
 const allLocal=await a.page.evaluate(()=>chrome.storage.local.get(null));
 assert.equal(JSON.stringify(allLocal).includes('a-very-long-test-account-address'),false);
 assert.equal(JSON.stringify(await cloud(a.worker)).includes('fixture-only'),false);
 assert.equal(JSON.stringify(await cloud(a.worker)).includes('example.invalid'),false);
 console.log('PASS account/status UI, tooltip bounds, responsive panel, identity stays memory-only');
 for(const copy of copies)assert.deepEqual(copy.errors,[]);
 await writeFile(resolve(output,'id-check.json'),JSON.stringify({id:expectedId,directories:copies.map(copy=>copy.directory),firefoxKey:false,realGoogleDelivery:'NOT TESTED'},null,2));
 console.log('SKIP real signed-in Google accounts/devices and real cloud delivery: controlled isolated fixtures only');
}finally{await Promise.all(copies.map(copy=>copy.context.close()));}
