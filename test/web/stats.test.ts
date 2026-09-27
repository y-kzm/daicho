import { describe, expect, it } from 'vitest';
import { computeStats } from '../../src/web/lib/stats';
import { entry } from './helpers';

describe('computeStats', () => {
  it('aggregates read, years, core, tags and venues', () => {
    const s = computeStats([
      entry({ id: 1, year: '2024', core: 'A', tags: ['X', 'Y'], journal: 'J' }),
      entry({ id: 2, year: '2024', core: 'A*', tags: ['X'], conference: 'C', read: '精読済' }),
      entry({ id: 3, year: 'n/a', tags: [], journal: 'J' }),
    ]);
    expect(s.total).toBe(3);
    expect(s.byRead).toEqual({ 未読: 2, 斜め読み: 0, 精読済: 1 });
    expect(s.years).toEqual([['2024', 2]]);
    expect(s.byCore).toEqual([['A*', 1], ['A', 1]]);
    expect(s.topTags).toEqual([['X', 2], ['Y', 1]]);
    expect(s.topVenues).toEqual([['J', 2], ['C', 1]]);
  });
});
