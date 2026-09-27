import { describe, expect, it } from 'vitest';
import { moveItem, moveWithinGroup, sortByOrder } from '../../src/web/lib/order';

describe('order helpers', () => {
  it('moveItem moves one step and never mutates', () => {
    const src = ['a', 'b', 'c'];
    expect(moveItem(src, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(src, 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(src, 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(src, 5, 1)).toEqual(['a', 'b', 'c']);
    expect(src).toEqual(['a', 'b', 'c']);
  });
  it('moveWithinGroup swaps with the neighbour inside the group only', () => {
    // 2 はアーカイブ済みでグループ外
    expect(moveWithinGroup([1, 2, 3, 4], [1, 3, 4], 3, -1)).toEqual([3, 2, 1, 4]);
    expect(moveWithinGroup([1, 2, 3, 4], [1, 3, 4], 4, 1)).toEqual([1, 2, 3, 4]);
  });
  it('sortByOrder sorts by sortOrder without mutating', () => {
    const src = [{ id: 1, sortOrder: 2 }, { id: 2, sortOrder: 1 }];
    expect(sortByOrder(src).map((x) => x.id)).toEqual([2, 1]);
    expect(src[0]!.id).toBe(1);
  });
});
