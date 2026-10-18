import {describe,it,expect} from 'vitest';
import {defaults} from '../types/models';
import {validateSettings} from '../services/validation';
import {serializeExport,parseImport} from '../services/importExport';
import {accentContrast,luminance,appearanceTokens} from '../utils/appearance';
describe('global appearance preferences',()=>{
 it('migrates legacy settings without changing existing fields and roundtrips JSON v2',async()=>{
  const settings=validateSettings({width:75,space:12,searchProvider:'imdb'});
  expect(settings).toMatchObject({width:75,space:12,searchProvider:'imdb',uiRadius:5,uiTransparency:20,uiBlur:true,uiAccent:'#FFCC00'});
  const custom={...settings,uiRadius:24,uiTransparency:50,uiBlur:false,uiAccent:'#3366CC'};
  const text=await serializeExport({entries:[],settings:custom,background:null});
  expect(JSON.parse(text).version).toBe(2);expect(parseImport(text).settings).toEqual(custom);
 });
 it('normalizes invalid new values to safe defaults and never passes through CSS',()=>{
  for(const value of [-1,25,NaN,Infinity,'5px',{},null])expect(validateSettings({uiRadius:value}).uiRadius).toBe(5);
  for(const value of [-1,51,'20%',NaN,[],null])expect(validateSettings({uiTransparency:value}).uiTransparency).toBe(20);
  for(const value of ['red','#FFF','#3366CC; background:url(x)','var(--bad)',{},null])expect(validateSettings({uiAccent:value}).uiAccent).toBe('#FFCC00');
  expect(validateSettings({uiAccent:'#aBcDeF',uiRadius:0,uiTransparency:0,uiBlur:false})).toMatchObject({uiAccent:'#ABCDEF',uiRadius:0,uiTransparency:0,uiBlur:false});
  expect(validateSettings({uiBlur:'invalid'}).uiBlur).toBe(true);
 });
 it('sets only surface alpha/blur and finds readable black or white accent text',()=>{
  expect(appearanceTokens(defaults)).toMatchObject({'--ui-radius':'5px','--ui-surface-alpha':'0.8','--ui-blur':'blur(10px)'});
  expect(appearanceTokens({...defaults,uiTransparency:50,uiBlur:false})).toMatchObject({'--ui-surface-alpha':'0.5','--ui-blur':'none'});
  for(const hex of ['#FFFFFF','#000000','#FFCC00','#3366CC','#777777','#FF5500','#CC0000']){
    const foreground=accentContrast(hex),a=luminance(hex),b=luminance(foreground);
    expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5);
  }
  // At maximum transparency, a white surface over black is the darkest case.
  expect((luminance('#808080')+.05)/(luminance('#111111')+.05)).toBeGreaterThanOrEqual(4.5);
  expect(appearanceTokens({...defaults,uiAccent:'#000000',uiTransparency:50})['--ui-button-underlay']).toBe('#000000');
  expect(appearanceTokens(defaults)['--ui-button-underlay']).toBe('transparent');
  expect(appearanceTokens({...defaults,uiAccent:'#3366CC'})['--ui-button-contrast']).toBe('#FFFFFF');
 });
});
