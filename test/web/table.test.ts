import { describe, expect, it } from 'vitest';
import type { Entry, SortKey } from '../../src/shared/types';
import {
  ALL_COLUMNS, collapseKey, collapsedSet, compareBy, DEFAULT_COLUMNS, groupEntries, isGrouped, nextSort, venueOf, visibleIds,
} from '../../src/web/lib/table';
import { entry } from './helpers';

const es = [
  entry({ id: 1, title: 'beta', added: '2026-01-01', year: '2020', conference: 'IMC', core: 'A', read: '精読済', priority: 1, tags: ['NDP'], lastOpenedAt: '2026-09-01T10:00:00Z' }),
  entry({ id: 2, title: 'Alpha', added: '2026-01-03', year: '2024', journal: 'IEEE Access', core: '', read: '未読', priority: 3, tags: ['IPv6', 'NDP'] }),
  entry({ id: 3, title: 'gamma', added: '2026-01-03', year: '', conference: 'NDSS', core: 'A*', read: '斜め読み', priority: 0, tags: [] }),
];
const ids = (list: Entry[]) => list.map((e) => e.id);
const sorted = (key: SortKey, dir: 'asc' | 'desc') => ids([...es].sort(compareBy(key, dir)));

describe('compareBy', () => {
  it('added: desc = newest first, same day by id desc', () => {
    expect(sorted('added', 'desc')).toEqual([3, 2, 1]);
    expect(sorted('added', 'asc')).toEqual([1, 2, 3]);
  });
  it('title is case-insensitive', () => {
    expect(sorted('title', 'asc')).toEqual([2, 1, 3]);
  });
  it('year: empty values go last in both directions', () => {
    expect(sorted('year', 'desc')).toEqual([2, 1, 3]);
    expect(sorted('year', 'asc')).toEqual([1, 2, 3]);
  });
  it('core: A* first when asc, unknown last', () => {
    expect(sorted('core', 'asc')).toEqual([3, 1, 2]);
    expect(sorted('core', 'desc')).toEqual([1, 3, 2]);
  });
  it('venue uses conference, then journal', () => {
    expect(venueOf(es[1]!)).toBe('IEEE Access');
    expect(sorted('venue', 'asc')).toEqual([2, 1, 3]);
  });
  it('read follows READ_STATES, priority and lastOpened', () => {
    expect(sorted('read', 'asc')).toEqual([2, 3, 1]);
    expect(sorted('priority', 'desc')).toEqual([2, 1, 3]);
    expect(sorted('lastOpened', 'desc')).toEqual([1, 3, 2]);
  });
  it('title: desc reverses order; an empty title still sorts last', () => {
    const withEmpty = [...es, entry({ id: 4, title: '' })];
    expect(ids([...withEmpty].sort(compareBy('title', 'desc')))).toEqual([3, 1, 2, 4]);
  });
  it('venue: desc reverses order; an entry with no venue still sorts last', () => {
    const withEmpty = [...es, entry({ id: 5, conference: '', journal: '' })];
    expect(ids([...withEmpty].sort(compareBy('venue', 'desc')))).toEqual([3, 1, 2, 5]);
  });
  it('read: desc reverses order; an unrecognised read value still sorts last', () => {
    const withUnknown = [...es, entry({ id: 6, read: '不明' })];
    expect(ids([...withUnknown].sort(compareBy('read', 'desc')))).toEqual([1, 3, 2, 6]);
  });
  it('priority: asc puts 0 first — priority is a raw number, 0 (優先度なし) is a real value, not "missing"', () => {
    expect(sorted('priority', 'asc')).toEqual([3, 1, 2]);
  });
  it('lastOpened: asc keeps earliest first; empty always sorts last regardless of direction', () => {
    const withSecond = [...es, entry({ id: 7, lastOpenedAt: '2026-09-05T10:00:00Z' })];
    expect(ids([...withSecond].sort(compareBy('lastOpened', 'asc')))).toEqual([1, 7, 3, 2]);
  });
});

describe('nextSort', () => {
  it('toggles on the same column and uses the default direction on a new one', () => {
    expect(nextSort({ key: 'added', dir: 'desc' }, 'added')).toEqual({ key: 'added', dir: 'asc' });
    expect(nextSort({ key: 'added', dir: 'desc' }, 'title')).toEqual({ key: 'title', dir: 'asc' });
    expect(nextSort({ key: 'title', dir: 'asc' }, 'year')).toEqual({ key: 'year', dir: 'desc' });
    expect(nextSort({ key: 'title', dir: 'asc' }, 'core')).toEqual({ key: 'core', dir: 'asc' });
  });
});

describe('groupEntries', () => {
  it('none returns one unnamed group', () => {
    const g = groupEntries(es, 'none');
    expect(g).toHaveLength(1);
    expect(g[0]!.key).toBe('');
    expect(ids(g[0]!.entries)).toEqual([1, 2, 3]);
    expect(isGrouped(g)).toBe(false);
  });
  it('year: newest first, missing last', () => {
    const g = groupEntries(es, 'year');
    expect(g.map((x) => [x.key, x.label, ids(x.entries)])).toEqual([['2024', '2024', [2]], ['2020', '2020', [1]], ['', '年なし', [3]]]);
    expect(isGrouped(g)).toBe(true);
  });
  it('read in state order, priority high first', () => {
    expect(groupEntries(es, 'read').map((x) => x.key)).toEqual(['未読', '斜め読み', '精読済']);
    expect(groupEntries(es, 'priority').map((x) => x.label)).toEqual(['優先度 高', '優先度 低', '優先度なし']);
  });
  it('firstTag and venue sort by name, empty last', () => {
    expect(groupEntries(es, 'firstTag').map((x) => x.key)).toEqual(['IPv6', 'NDP', '']);
    expect(groupEntries(es, 'firstTag').at(-1)!.label).toBe('タグなし');
    expect(groupEntries(es, 'venue').map((x) => x.key)).toEqual(['IEEE Access', 'IMC', 'NDSS']);
  });
  it('preserves input order for multiple entries within the same group (year and read)', () => {
    const g = [
      entry({ id: 21, added: '2026-01-01', year: '2021', read: '未読' }),
      entry({ id: 22, added: '2026-01-02', year: '2021', read: '未読' }),
      entry({ id: 23, added: '2026-01-03', year: '2022', read: '斜め読み' }),
    ];
    expect(groupEntries(g, 'year').find((x) => x.key === '2021')!.entries.map((e) => e.id)).toEqual([21, 22]);
    expect(groupEntries(g, 'read').find((x) => x.key === '未読')!.entries.map((e) => e.id)).toEqual([21, 22]);
  });
});

describe('collapse helpers and columns', () => {
  it('visibleIds skips collapsed groups', () => {
    expect(visibleIds(groupEntries(es, 'year'), new Set(['2020']))).toEqual([2, 3]);
  });
  it('collapsedSet picks keys for the current groupBy', () => {
    expect(collapsedSet([collapseKey('year', '2020'), collapseKey('read', '未読')], 'year')).toEqual(new Set(['2020']));
  });
  it('default columns are known, title is sortable', () => {
    expect(DEFAULT_COLUMNS.every((k) => ALL_COLUMNS.some((c) => c.key === k))).toBe(true);
    expect(ALL_COLUMNS.find((c) => c.key === 'title')?.sort).toBe('title');
    expect(ALL_COLUMNS.find((c) => c.key === 'tags')?.sort).toBeUndefined();
  });
});
