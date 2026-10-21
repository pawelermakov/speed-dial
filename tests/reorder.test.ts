import { describe,it,expect } from 'vitest';
import { insertedOrder } from '../utils/reorder';
describe('drag insertion',()=>{
 it('inserts on either side and ignores self, unknown and unchanged drops',()=>{
  expect(insertedOrder(['a','b','c'],'a','c',false)).toEqual(['b','a','c']);
  expect(insertedOrder(['a','b','c'],'a','c',true)).toEqual(['b','c','a']);
  expect(insertedOrder(['a','b','c'],'c','a',false)).toEqual(['c','a','b']);
  expect(insertedOrder(['a','b'],'a','a',true)).toBeNull();
  expect(insertedOrder(['a','b'],'a','b',false)).toBeNull();
  expect(insertedOrder(['a','b'],'other','b',true)).toBeNull();
 });
});
