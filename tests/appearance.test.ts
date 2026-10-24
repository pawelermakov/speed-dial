import {describe,it,expect} from 'vitest';
import {validateSettings} from '../services/validation';
import {serializeExport,parseImport} from '../services/importExport';
import {syncPatch} from '../services/settingsSchema';
function luminance(hex:string):number {
  const channels=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return .2126*channels[0]!+.7152*channels[1]!+.0722*channels[2]!;
}

describe('current settings contract',()=>{
 it('roundtrips current settings through export and Sync',async()=>{
  const settings=validateSettings({width:75,space:12,email:'test@mail.ru',searchProvider:'imdb'});
  const text=await serializeExport({entries:[],settings,background:null});
  expect(JSON.parse(text).version).toBe(2);expect(parseImport(text).settings).toEqual(settings);
  expect(syncPatch(Object.fromEntries(Object.entries(settings).map(([key,value])=>['settings.v1.'+key,value])))).toEqual(settings);
 });
 it('rejects malformed boolean settings',()=>{
  for(const value of ['true',0,1,null,{}])expect(()=>validateSettings({addButton:value})).toThrow();
  expect(validateSettings({addButton:false}).addButton).toBe(false);
 });
 it('keeps secondary text readable on the darkest control material',()=>{
  expect((luminance('#DBDBDB')+.05)/(luminance('#475569')+.05)).toBeGreaterThanOrEqual(4.5);
 });
});
