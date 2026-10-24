import { describe, expect, it } from 'vitest';
import { contextKey, gridFocusIndex, plainNavigation } from '../utils/keyboard';

describe('responsive keyboard grid', () => {
  for (const columns of [2,6,12]) {
    it(`navigates ${columns} columns and a short final row without wrapping`, () => {
      const count = columns * 2 + 1;
      expect(gridFocusIndex(0,count,columns,'ArrowLeft')).toBe(0);
      expect(gridFocusIndex(columns-1,count,columns,'ArrowRight')).toBe(columns-1);
      expect(gridFocusIndex(1,count,columns,'ArrowUp')).toBe(1);
      expect(gridFocusIndex(columns-1,count,columns,'ArrowDown')).toBe(columns*2-1);
      expect(gridFocusIndex(columns*2-1,count,columns,'ArrowDown')).toBe(count-1);
      expect(gridFocusIndex(count-1,count,columns,'ArrowDown')).toBe(count-1);
      expect(gridFocusIndex(count-1,count,columns,'ArrowUp')).toBe(columns);
      expect(gridFocusIndex(columns+1,count,columns,'Home')).toBe(columns);
      expect(gridFocusIndex(columns+1,count,columns,'End')).toBe(columns*2-1);
    });
  }
  it('recomputes rows after resize and clamps disappearing search results', () => {
    expect(gridFocusIndex(5,14,6,'ArrowDown')).toBe(11);
    expect(gridFocusIndex(5,14,2,'ArrowDown')).toBe(7);
    expect(gridFocusIndex(11,3,2,'Home')).toBe(2);
    expect(gridFocusIndex(0,0,2,'End')).toBe(-1);
  });
  it('leaves composition and browser shortcuts alone', () => {
    const event = (props: object) => ({key:'ArrowDown',...props}) as KeyboardEvent;
    for (const props of [{isComposing:true},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true}]) expect(plainNavigation(event(props))).toBe(false);
    expect(plainNavigation(event({}))).toBe(true);
    expect(contextKey(event({key:'F10',shiftKey:true}))).toBe(true);
    expect(contextKey(event({key:'ContextMenu'}))).toBe(true);
    expect(contextKey(event({key:'ContextMenu',isComposing:true}))).toBe(false);
  });
});
