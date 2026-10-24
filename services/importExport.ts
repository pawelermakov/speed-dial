import { defaults, type BackupBookmark, type BackupSelection, type ImportData } from '../types/models';
import { blobToDataUrl } from './images';
import { normalizeUrl, record, validateSettings } from './validation';

export const backupLimits = { file:40*1024*1024, image:20*1024*1024, images:24*1024*1024, entries:10000, pixels:32000000 } as const;
const raster = /^image\/(png|jpeg|webp|gif|bmp|avif|x-icon|vnd.microsoft.icon)$/;
function fields(data:Record<string,unknown>, allowed:string[]) {
  if(Object.keys(data).some(key=>!allowed.includes(key)))throw new Error('Файл содержит неизвестные поля. Нужна резервная копия SpeedDial X версии 3.');
}
export function parseImport(text:string):ImportData {
  if(text.length>backupLimits.file || new TextEncoder().encode(text).length>backupLimits.file)throw new Error('Файл резервной копии больше 40 МБ.');
  let json:unknown;try{json=JSON.parse(text);}catch{throw new Error('Не удалось прочитать JSON. Выберите файл резервной копии.');}
  const data=record(json,'Резервная копия');
  if(data.version!==3)throw new Error('Поддерживаются только резервные копии SpeedDial X версии 3.');
  fields(data,['version','entries','settings','background','bookmarks']);
  if(data.bookmarks!==undefined&&data.bookmarks!==false)throw new Error('Некорректный состав резервной копии.');
  if(!Array.isArray(data.entries))throw new Error('Не найден список закладок.');
  let count=0,bytes=0;
  function image(value:unknown):Blob|null {
    if(value===null || value===undefined)return null;
    if(typeof value!=='string' || value.length>Math.ceil(backupLimits.image/3)*4+100)throw new Error('Изображение: нужен растровый data URL до 20 МБ.');
    const match=/^data:(image\/[a-z.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if(!match || !raster.test(match[1]!) || match[2]!.length%4)throw new Error('Неподдерживаемый тип изображения или повреждённый Base64.');
    let binary:string;try{binary=atob(match[2]!);}catch{throw new Error('Повреждённый Base64 изображения.');}
    if(btoa(binary)!==match[2])throw new Error('Повреждённый Base64 изображения.');
    bytes+=binary.length;
    if(!binary.length || binary.length>backupLimits.image || bytes>backupLimits.images)throw new Error('Изображение больше 20 МБ или все изображения больше 24 МБ.');
    return new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:match[1]!});
  }
  function title(value:unknown):string {
    if(++count>backupLimits.entries)throw new Error('В резервной копии больше 10000 записей.');
    if(typeof value!=='string' || value.length>4096 || /[\u0000-\u001f\u007f]/.test(value))throw new Error('Некорректное название закладки или папки.');
    return value;
  }
  function bookmark(value:unknown):BackupBookmark {
    const row=record(value,'Закладка');fields(row,['title','url','autoName','thumbnail','favicon']);
    const result:BackupBookmark={title:title(row.title),url:normalizeUrl(row.url)};
    if(row.autoName!==undefined){if(row.autoName!==true || result.title!==new URL(result.url).hostname)throw new Error('Некорректный признак автоматического названия.');result.autoName=true;}
    for(const key of ['thumbnail','favicon'] as const){const blob=image(row[key]);if(blob)result[key]=blob;}
    return result;
  }
  const entries=data.entries.map(value=>{
    const row=record(value,'Элемент');if('url' in row)return bookmark(row);
    fields(row,['title','children']);
    if(!Array.isArray(row.children))throw new Error('Папка: нужен список закладок без вложенных папок.');
    const name=title(row.title);return {title:name,children:row.children.map(bookmark)};
  });
  const result:ImportData={entries};
  if(data.bookmarks===false)result.bookmarks=false;
  if(Object.hasOwn(data,'settings')){
    const raw=record(data.settings,'Настройки');fields(raw,Object.keys(defaults));
    const settings=validateSettings(raw);
    for(const key of Object.keys(defaults))if(raw[key]!==settings[key as keyof typeof settings])throw new Error('Неполные или некорректные настройки в резервной копии.');
    result.settings=settings;
  }
  if(Object.hasOwn(data,'background'))result.background=image(data.background);
  return result;
}
async function checkImage(blob:Blob) {
  if(!raster.test(blob.type) || !blob.size || blob.size>backupLimits.image)throw new Error('Неподдерживаемое изображение или размер больше 20 МБ.');
  const header=new Uint8Array(await blob.slice(0,64).arrayBuffer());
  const ascii=(start:number,length:number)=>String.fromCharCode(...header.slice(start,start+length));
  const signature=blob.type==='image/png'?header[0]===137&&ascii(1,3)==='PNG':
    blob.type==='image/jpeg'?header[0]===255&&header[1]===216&&header[2]===255:
    blob.type==='image/gif'?['GIF87a','GIF89a'].includes(ascii(0,6)):
    blob.type==='image/webp'?ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP':
    blob.type==='image/bmp'?ascii(0,2)==='BM':
    blob.type==='image/avif'?ascii(4,4)==='ftyp'&&/avif|avis/.test(ascii(8,56)):
    header[0]===0&&header[1]===0&&header[2]===1&&header[3]===0;
  if(!signature)throw new Error('Содержимое изображения не соответствует растровому формату.');
  const bitmap=await createImageBitmap(blob);
  try{if(!bitmap.width || !bitmap.height || bitmap.width*bitmap.height>backupLimits.pixels)throw new Error('Изображение больше 32 мегапикселей.');}finally{bitmap.close();}
}
export async function validateImportImages(data:ImportData) {
  if(data.background)await checkImage(data.background);
  for(const entry of data.entries)for(const row of 'url' in entry?[entry]:entry.children)
    for(const key of ['thumbnail','favicon'] as const)if(row[key])await checkImage(row[key]);
}
export function selectExport(data:ImportData,selection:BackupSelection):ImportData {
  const bookmark=(row:BackupBookmark):BackupBookmark=>({title:row.title,url:row.url,...(selection.bookmarks&&row.autoName?{autoName:true as const}:{}),...(selection.images&&row.thumbnail?{thumbnail:row.thumbnail}:{}),...(selection.images&&row.favicon?{favicon:row.favicon}:{})});
  return {entries:selection.bookmarks||selection.images?data.entries.map(row=>'url' in row?bookmark(row):{title:row.title,children:row.children.map(bookmark)}):[],...(!selection.bookmarks||data.bookmarks===false?{bookmarks:false as const}:{}),...(selection.settings&&data.settings?{settings:data.settings}:{}),...(selection.background&&data.background!==undefined?{background:data.background}:{})};
}
export async function serializeExport(data:ImportData,warning:(message:string)=>void=()=>{}):Promise<string> {
  let bytes=0,count=0;
  async function image(blob:Blob|undefined|null,label:string){
    if(!blob)return null;
    try{await checkImage(blob);}catch{warning('Пропущено повреждённое изображение: '+label);return null;}
    if(bytes+blob.size>backupLimits.images)throw new Error('Изображения занимают больше 24 МБ. Резервная копия слишком велика.');
    try{const result=await blobToDataUrl(blob);bytes+=blob.size;return result;}catch{warning('Не удалось прочитать изображение: '+label);return null;}
  }
  async function bookmark(row:BackupBookmark){
    if(++count>backupLimits.entries)throw new Error('Больше 10000 записей.');
    const result:Record<string,unknown>={title:row.title,url:row.url};if(row.autoName)result.autoName=true;
    for(const key of ['thumbnail','favicon'] as const){const value=await image(row[key],row.title+' / '+key);if(value)result[key]=value;}
    return result;
  }
  const entries=[];
  for(const entry of data.entries){
    if('url' in entry)entries.push(await bookmark(entry));
    else{if(++count>backupLimits.entries)throw new Error('Больше 10000 записей.');const children=[];for(const row of entry.children)children.push(await bookmark(row));entries.push({title:entry.title,children});}
  }
  const background=data.background===null?null:data.background?await image(data.background,'Фон'):undefined;
  // An unreadable image is omitted, not converted into an instruction to clear wallpaper.
  const includeBackground=data.background===null||background!=null;
  const text=JSON.stringify({version:3,entries,...(data.bookmarks===false?{bookmarks:false}:{}),...(data.settings?{settings:validateSettings(data.settings)}:{}),...(includeBackground?{background}:{})});
  parseImport(text);return text;
}
export function downloadExport(text:string):void {
  const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='speed-dial-backup-'+new Date().toISOString().slice(0,10)+'.json';
  try{document.body.appendChild(link);link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
}
