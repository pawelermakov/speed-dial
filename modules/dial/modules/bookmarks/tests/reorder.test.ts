import { describe, it, expect } from 'vitest';
import { insertedOrder, nearestInsertion } from '../helpers/reorder';
describe('drag insertion', () => {
  it('inserts on either side and ignores self, unknown and unchanged drops', () => {
    expect(insertedOrder(['a', 'b', 'c'], 'a', 'c', false)).toEqual(['b', 'a', 'c']);
    expect(insertedOrder(['a', 'b', 'c'], 'a', 'c', true)).toEqual(['b', 'c', 'a']);
    expect(insertedOrder(['a', 'b', 'c'], 'c', 'a', false)).toEqual(['c', 'a', 'b']);
    expect(insertedOrder(['a', 'b'], 'a', 'a', true)).toBeNull();
    expect(insertedOrder(['a', 'b'], 'a', 'b', false)).toBeNull();
    expect(insertedOrder(['a', 'b'], 'other', 'b', true)).toBeNull();
  });
});

describe('grid gap insertion', () => {
  const rows = [
    { id: 'a', left: 0, right: 100, top: 0, bottom: 60 },
    { id: 'b', left: 124, right: 224, top: 0, bottom: 60 },
    { id: 'c', left: 0, right: 100, top: 84, bottom: 144 },
  ];
  it('resolves the gap between tiles to the shared insertion slot', () => {
    expect(nearestInsertion(rows, 112, 30)).toEqual({ id: 'a', after: true });
    expect(insertedOrder(['a', 'b', 'c'], 'c', 'a', true)).toEqual(['a', 'c', 'b']);
  });
  it('supports trailing blank space and either edge of a row', () => {
    expect(nearestInsertion(rows, 90, 180)).toEqual({ id: 'c', after: true });
    expect(nearestInsertion(rows, -5, 110)).toEqual({ id: 'c', after: false });
    expect(nearestInsertion([], 0, 0)).toBeNull();
    expect(
      nearestInsertion(
        [...rows, { id: 'd', left: 124, right: 224, top: 84, bottom: 144 }],
        30,
        180,
      ),
    ).toEqual({ id: 'd', after: true });
  });
});
