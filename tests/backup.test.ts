import type { MessageText } from '../services/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupLimits, parseImport, selectExport, serializeExport, validateImportImages } from '../services/importExport';
import { defaults } from '../types/models';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const image=()=>new Blob([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],{type:'image/png'});
const backup=(patch:Record<string,unknown>={})=>JSON.stringify({version:3,entries:[],settings:defaults,background:null,...patch});
beforeEach(()=>{
 vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:1,height:1,close:vi.fn()})));
 vi.stubGlobal('FileReader',class{result='';onload?:()=>void;onerror?:()=>void;readAsDataURL(blob:Blob){void blob.arrayBuffer().then(buffer=>{this.result='data:'+blob.type+';base64,'+btoa(String.fromCharCode(...new Uint8Array(buffer)));this.onload?.();});}});
});
afterEach(()=>vi.unstubAllGlobals());
describe('complete backup contract',()=>{
 it('roundtrips per-entry images, wallpaper and provenance without profile IDs',async()=>{
  const data={entries:[{title:'example.com',url:'https://example.com/',autoName:true as const,thumbnail:image(),favicon:image()},{title:'Folder',children:[{title:'Other',url:'https://example.com/',thumbnail:image()}]}],settings:{...defaults,theme:'dark' as const},background:image()};
  const text=await serializeExport(data),restored=parseImport(text);await validateImportImages(restored);
  expect(JSON.parse(text).version).toBe(3);expect(restored.entries).toHaveLength(2);expect(restored.settings!.theme).toBe('dark');
  const row=restored.entries[0]!;expect('url' in row&&row.autoName).toBe(true);expect('url' in row&&await row.thumbnail!.text()).toBe(await image().text());
  expect(text).not.toMatch(/bookmarkId|rootFolderId|faviconColor|token|syncing/);
 });
 it.each([99,null])('rejects unsupported version %s',version=>{expect(()=>parseImport(backup({version}))).toThrow('версии 3');});
 it.each(['data:image/svg+xml;base64,PHN2Zz4=','data:text/html;base64,WA==','data:image/png;base64,AAA','data:image/png;base64,AB==','data:image/png;base64,'])('rejects unsafe/noncanonical resources',background=>{expect(()=>parseImport(backup({background}))).toThrow();});
 it('checks actual raster bytes and decode errors before confirmation',async()=>{
  const data=parseImport(backup({background:'data:image/png;base64,'+btoa('<svg/>')}));await expect(validateImportImages(data)).rejects.toThrow('растровому');
  vi.mocked(createImageBitmap).mockRejectedValueOnce(Error('decode'));await expect(validateImportImages({...data,background:image()})).rejects.toThrow('decode');
 });
 it('rejects excessive pixels and closes the decoder',async()=>{
  const close=vi.fn();vi.mocked(createImageBitmap).mockResolvedValueOnce({width:100000,height:100000,close} as unknown as ImageBitmap);
  await expect(validateImportImages({entries:[],settings:defaults,background:image()})).rejects.toThrow('мегапикселей');expect(close).toHaveBeenCalled();
 });
 it('skips corrupt optional resources with an explicit warning',async()=>{
  const warnings:MessageText[]=[];const text=await serializeExport({entries:[{title:'A',url:'https://a.example/',thumbnail:new Blob(['<svg/>'],{type:'image/png'}),favicon:image()}],settings:defaults,background:null},message=>warnings.push(message));
  expect(warnings).toHaveLength(1);expect(JSON.parse(text).entries[0].thumbnail).toBeUndefined();expect(JSON.parse(text).entries[0].favicon).toContain('data:image/png');
 });
 it('validates complete settings, unknown fields, nesting, URLs, provenance and total entry count',()=>{
  for(const patch of [{settings:{}},{rootFolderId:'private'},{entries:[{title:'A',url:'javascript:alert(1)'}]},{entries:[{title:'A',url:'https://a.example/',id:'private'}]},{entries:[{title:'A',children:[{title:'B',children:[]}]}]},{entries:[{title:'A',url:'https://a.example/',autoName:true}]},{entries:Array(10001).fill({title:'Empty',children:[]})}])expect(()=>parseImport(backup(patch))).toThrow();
 });
 it('bounds text bytes and binary resources',()=>{
  expect(()=>parseImport(' '.repeat(backupLimits.file+1))).toThrow('40 МБ');
  expect(()=>parseImport(backup({background:'data:image/png;base64,'+'A'.repeat(Math.ceil(backupLimits.image/3)*4+4)}))).toThrow();
 });
});

it('skips an oversized corrupt cache image without preventing a valid backup',async()=>{const warnings:MessageText[]=[];const text=await serializeExport({entries:[{title:'A',url:'https://a.example/',thumbnail:new Blob([new Uint8Array(25*1024*1024)],{type:'text/html'})}],settings:defaults,background:null},message=>warnings.push(message));expect(JSON.parse(text).entries[0]).toEqual({title:'A',url:'https://a.example/'});expect(warnings).toHaveLength(1);});


it('roundtrips omitted sections without adding defaults or clearing wallpaper',async()=>{
 for(const data of [{bookmarks:false as const,entries:[],settings:defaults},{bookmarks:false as const,entries:[],background:null},{bookmarks:false as const,entries:[{title:'A',url:'https://a.example/',thumbnail:image()}]},{entries:[{title:'A',url:'https://a.example/'}]}]){
  const text=await serializeExport(data),json=JSON.parse(text),restored=parseImport(text);
  expect(Object.hasOwn(restored,'settings')).toBe(Object.hasOwn(data,'settings'));expect(Object.hasOwn(json,'settings')).toBe(Object.hasOwn(data,'settings'));expect(Object.hasOwn(restored,'background')).toBe(Object.hasOwn(data,'background'));expect(Object.hasOwn(json,'background')).toBe(Object.hasOwn(data,'background'));expect(restored.bookmarks).toBe(data.bookmarks);
 }
 expect(()=>parseImport(backup({bookmarks:'no'}))).toThrow('состав');
});


it('selects sections from a fixed preview without mutating it or including excluded payloads',async()=>{
 const thumbnail=image(),background=image(),data={entries:[{title:'example.com',url:'https://example.com/',autoName:true as const,thumbnail},{title:'Folder',children:[{title:'A',url:'https://a.example/',favicon:thumbnail}]}],settings:defaults,background};
 const images=selectExport(data,{bookmarks:false,images:true,settings:false,background:false});expect(images).toEqual({bookmarks:false,entries:[{title:'example.com',url:'https://example.com/',thumbnail},{title:'Folder',children:[{title:'A',url:'https://a.example/',favicon:thumbnail}]}]});
 const bookmarks=selectExport(data,{bookmarks:true,images:false,settings:false,background:false});expect(bookmarks).toEqual({entries:[{title:'example.com',url:'https://example.com/',autoName:true},{title:'Folder',children:[{title:'A',url:'https://a.example/'}]}]});
 expect(selectExport(data,{bookmarks:false,images:false,settings:true,background:false})).toEqual({bookmarks:false,entries:[],settings:defaults});expect(selectExport(data,{bookmarks:false,images:false,settings:false,background:true})).toEqual({bookmarks:false,entries:[],background});
 expect(data.entries[0]).toMatchObject({autoName:true,thumbnail});expect(data.settings).toBe(defaults);expect(data.background).toBe(background);
});


it('omits an unreadable wallpaper without turning it into a clear-background instruction',async()=>{
 const warnings:MessageText[]=[];const text=await serializeExport({entries:[],settings:defaults,background:new Blob(['broken'],{type:'image/png'})},message=>warnings.push(message));
 expect(warnings).toHaveLength(1);expect(Object.hasOwn(JSON.parse(text),'background')).toBe(false);expect(Object.hasOwn(parseImport(text),'background')).toBe(false);
 expect(JSON.parse(await serializeExport({entries:[],background:null})).background).toBeNull();
});
