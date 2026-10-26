import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
const ext=resolve('.output/chrome-mv3'),out=resolve('.browser-test/startup-motion');await mkdir(out,{recursive:true});
const context=await chromium.launchPersistentContext(resolve('.browser-test/startup-'+crypto.randomUUID()),{locale:'ru-RU',channel:'chromium',headless:true,deviceScaleFactor:process.argv.includes('--fractional-scale')?1.25:1,args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
try {
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(worker.url().replace('background.js','newtab.html'));await expect(page.locator('.folder-root')).toBeEnabled();
 // Hold the shared data lock to inspect a genuinely pending tab startup.
 await page.evaluate(async()=>{let ready;const entered=new Promise(resolve=>ready=resolve);void navigator.locks.request('speed-dial-data',()=>{ready();return new Promise(resolve=>window.releaseStartupData=resolve);});await entered;});
 const opening=await context.newPage();
 try{
  await opening.goto(worker.url().replace('background.js','newtab.html'));await expect(opening.locator('.page')).toBeVisible();
  await expect(opening.locator('.dial')).not.toHaveClass(/is-loaded/);
  await expect(opening.locator('.bookmark-area')).toBeEmpty();await expect(opening.locator('.surface-empty')).toHaveCount(0);
  await opening.screenshot({path:resolve(out,'pending-startup.png')});
 }finally{await page.evaluate(()=>window.releaseStartupData());}
 await expect(opening.locator('.folder-root')).toBeEnabled();await opening.close();

 const fixture=await page.evaluate(async()=>{
  const {rootFolderId}=await chrome.storage.local.get('rootFolderId');
  const row=await chrome.bookmarks.create({parentId:rootFolderId,title:'Startup tile',url:'https://example.com/'});
  const folder=await chrome.bookmarks.create({parentId:rootFolderId,title:'Startup folder'});
  await chrome.bookmarks.create({parentId:folder.id,title:'Folder tile',url:'https://folder.example/'});
  const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1920,1080);ctx.fillStyle='#17212f';
  for(let x=0;x<1920;x+=5)ctx.fillRect(x,0,2,1080);
  ctx.font='24px Segoe UI';ctx.fillText('Sharp screenshot sample 0123456789',20,40);
  const thumbnail=await new Promise(r=>canvas.toBlob(r));
  const db=await new Promise(r=>{const req=indexedDB.open('SpeedDialX');req.onsuccess=()=>r(req.result)});
  await new Promise((resolve,reject)=>{const tx=db.transaction('tileAssets','readwrite');tx.objectStore('tileAssets').put({bookmarkId:row.id,url:row.url,thumbnail});tx.oncomplete=resolve;tx.onerror=reject});db.close();return row.id;
 });
 await page.addInitScript(()=>{
  window.tileReveals=[];window.startupEvents=[];window.pauseTileReveal=false;
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){
   const animation=animate.call(this,frames,options);
   if(options?.id==='bookmark-reveal'){
    window.tileReveals.push({frames,duration:options.duration,tile:this.matches('.bookmark,.add-card')});
    if(window.pauseTileReveal){animation.pause();animation.currentTime=options.duration-.001;}
   }
   return animation;
  };
  document.addEventListener('animationend',e=>{if(e.animationName==='startup-reveal')window.startupEvents.push(e.target.tagName)});
  const decode=HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode=function(){return decode.call(this).then(()=>new Promise(resolve=>window.releaseStartupImage=resolve))};
 });
 const grid=page.locator('.bookmarks');
 const releaseImage=async()=>{
  await expect.poll(()=>page.evaluate(()=>typeof window.releaseStartupImage)).toBe('function');
  await page.evaluate(()=>{const release=window.releaseStartupImage;delete window.releaseStartupImage;release()});
 };
 await page.reload();await expect.poll(()=>page.evaluate(()=>typeof window.releaseStartupImage)).toBe('function');
 await expect(grid).toHaveCSS('visibility','hidden');assert.equal(await page.evaluate(()=>window.tileReveals.length),0);
 await releaseImage();await expect(grid).toHaveCSS('visibility','visible');
 const tileCount=await grid.locator(':scope > a,:scope > button').count();
 await expect.poll(()=>page.evaluate(()=>window.tileReveals.length)).toBe(tileCount);
 for(const reveal of await page.evaluate(()=>window.tileReveals))assert.deepEqual(reveal,{frames:[{opacity:0},{opacity:1}],duration:150,tile:true});
 await expect(grid).toHaveCSS('opacity','1');await expect(grid).toHaveCSS('animation-name','none');
 await expect.poll(()=>page.evaluate(()=>window.startupEvents.length)).toBe(2);
 await page.getByRole('button',{name:'Startup folder',exact:true}).click();await expect(page.locator('.bookmark')).toHaveAttribute('href','https://folder.example/');
 const folderCount=await grid.locator(':scope > a,:scope > button').count();
 await expect.poll(()=>page.evaluate(()=>window.tileReveals.length)).toBe(tileCount+folderCount);
 await page.locator('.folder-root').click();await releaseImage();await expect(grid).toHaveCSS('visibility','visible');
 await expect.poll(()=>page.evaluate(()=>window.tileReveals.length)).toBe(tileCount*2+folderCount);
 const count=await page.evaluate(()=>window.tileReveals.length);
 await page.locator('.folder-root').click();assert.equal(await page.evaluate(()=>window.tileReveals.length),count);
 await page.evaluate(id=>chrome.bookmarks.update(id,{title:'Renamed startup tile'}),fixture);
 await expect(page.locator('.bookmark')).toHaveAttribute('title','Renamed startup tile — https://example.com/');assert.equal(await page.evaluate(()=>window.tileReveals.length),count);
 assert.equal(await page.evaluate(()=>window.startupEvents.length),2);
 // Compare screenshot detail immediately before and after the animated layer is removed.
 for(const width of [360,1280,1920]){
  await page.setViewportSize({width,height:800});await page.evaluate(()=>window.pauseTileReveal=true);
  await page.getByRole('button',{name:'Startup folder',exact:true}).click();await expect(page.locator('.bookmark')).toHaveAttribute('href','https://folder.example/');
  await page.locator('.folder-root').click();await releaseImage();await expect(grid).toHaveCSS('visibility','visible');
  const tile=page.locator('.bookmark').first();await expect.poll(()=>tile.evaluate(e=>e.getAnimations().some(a=>a.id==='bookmark-reveal'&&a.playState==='paused'))).toBe(true);
  const before=await tile.boundingBox();await expect(grid).toHaveCSS('opacity','1');
  const clip={x:Math.ceil(before.x)+12,y:Math.ceil(before.y)+12,width:Math.floor(before.width)-24,height:Math.max(8,Math.floor(before.height)-64)};
  const during=await page.screenshot({clip,path:resolve(out,`${width}-during.png`)});
  await page.evaluate(()=>document.getAnimations().filter(a=>a.id==='bookmark-reveal').forEach(a=>a.finish()));
  const after=await page.screenshot({clip,path:resolve(out,`${width}-after.png`)});assert.deepEqual(await tile.boundingBox(),before);
  const delta=await page.evaluate(async([a,b])=>{
   const read=async bytes=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(bytes)],{type:'image/png'}));const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return ctx.getImageData(0,0,canvas.width,canvas.height).data};
   const x=await read(a),y=await read(b);let changed=0,max=0;for(let i=0;i<x.length;i+=4){let difference=0;for(let c=0;c<3;c++)difference=Math.max(difference,Math.abs(x[i+c]-y[i+c]));if(difference>1)changed++;max=Math.max(max,difference)}return{changed,max};
  },[Array.from(during),Array.from(after)]);
  assert.equal(delta.changed,0,`screenshot detail changed at ${width}: ${JSON.stringify(delta)}`);
 }
 await page.reload();await releaseImage();await expect(grid).toHaveCSS('visibility','visible');
 await page.evaluate(()=>window.pauseTileReveal=true);
 await page.getByRole('button',{name:'Startup folder',exact:true}).click();await expect(page.locator('.bookmark')).toHaveAttribute('href','https://folder.example/');
 await expect.poll(()=>grid.evaluate(e=>e.getAnimations({subtree:true}).some(a=>a.id==='bookmark-reveal'))).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect.poll(()=>grid.evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
 await page.reload();await releaseImage();await expect(grid).toHaveCSS('visibility','visible');
 await expect(grid).toHaveCSS('opacity','1');assert.deepEqual(await page.evaluate(()=>window.tileReveals),[]);assert.deepEqual(await page.evaluate(()=>window.startupEvents),[]);
 await page.getByRole('button',{name:'Startup folder',exact:true}).click();await expect(page.locator('.bookmark')).toHaveAttribute('href','https://folder.example/');assert.deepEqual(await page.evaluate(()=>window.tileReveals),[]);
 assert.deepEqual(errors,[]);console.log('PASS 150 ms per-tile reveal, stable grid/bitmap detail at 3 widths, decode readiness, folder changes, no replay on metadata/same folder, reduced motion');
} finally {await context.close()}
