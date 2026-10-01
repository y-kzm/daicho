import { describe, expect, it } from 'vitest';
import type { FilterQuery, SavedFilter } from '../../src/shared/types';
import {
  applyQuery, BUILTIN_LABELS, builtinQuery, BUILTINS, countFor, DEFAULT_QUERY, describeQuery, isFiltering, isFilteringBeyond,
  sameSource, sourceLabel, sourceQuery, toSavedQuery, withoutFilters,
} from '../../src/web/lib/smart';
import { entry } from './helpers';

const now = new Date('2026-09-27T12:00:00Z');
const es = [
  entry({
    id: 1, title: 'IPv6 Neighbor Discovery', added: '2026-09-20', year: '2021', read: '精読済', tags: ['IPv6', 'NDP'],
    starred: true, priority: 3, lastOpenedAt: '2026-09-26T01:00:00Z', cites: { '7': { state: '引用する', position: 0, memo: '' } },
  }),
  entry({ id: 2, title: 'Measuring DNS', added: '2026-08-01', year: '2019', read: '未読', tags: ['DNS'], note: 'resolver study' }),
  entry({ id: 3, title: 'Unfiled paper', added: '2026-09-01', year: '', read: '斜め読み' }),
];
const ids = (q: FilterQuery) => applyQuery(es, q, now).map((e) => e.id);

describe('builtin collections', () => {
  it('all / starred / unfiled', () => {
    expect(ids(builtinQuery('all', now))).toEqual([1, 3, 2]);
    expect(ids(builtinQuery('starred', now))).toEqual([1]);
    expect(ids(builtinQuery('unfiled', now))).toEqual([3]);
  });
  it('recentAdded = within 30 days, recentOpened = opened only', () => {
    expect(ids(builtinQuery('recentAdded', now))).toEqual([1, 3]);
    expect(ids(builtinQuery('recentOpened', now))).toEqual([1]);
  });
  it('recentAdded window is computed in local time', () => {
    // ローカル 9/27 01:00。UTC で計算すると JST などでは 1 日ずれる
    const early = new Date(2026, 8, 27, 1, 0);
    const edge = [entry({ id: 9, added: '2026-08-28' }), entry({ id: 8, added: '2026-08-27' })];
    expect(applyQuery(edge, builtinQuery('recentAdded', early), early).map((e) => e.id)).toEqual([9]);
  });
  it('labels in sidebar order', () => {
    expect(BUILTINS.map((b) => BUILTIN_LABELS[b])).toEqual(['ライブラリ', '★ スター', '最近追加', '最近開いた', '未分類']);
  });
});

describe('matches', () => {
  it('read, tags any / all', () => {
    expect(ids({ read: ['未読', '斜め読み'] })).toEqual([3, 2]);
    expect(ids({ tags: ['NDP', 'DNS'] })).toEqual([1, 2]);
    expect(ids({ tags: ['NDP', 'DNS'], tagMode: 'all' })).toEqual([]);
    expect(ids({ tags: ['IPv6', 'NDP'], tagMode: 'all' })).toEqual([1]);
  });
  it('project, cite, year, star and priority', () => {
    expect(ids({ projectId: 7 })).toEqual([1]);
    expect(ids({ projectId: 7, cite: ['気になる'] })).toEqual([]);
    expect(ids({ cite: ['引用する'] })).toEqual([1]);
    expect(ids({ yearFrom: 2020 })).toEqual([1]);
    expect(ids({ yearTo: 2020 })).toEqual([2]);
    expect(ids({ starred: false })).toEqual([3, 2]);
    expect(ids({ priority: [0] })).toEqual([3, 2]);
  });
  it('search is case-insensitive and ANDs the words across fields', () => {
    expect(ids({ search: 'ipv6' })).toEqual([1]);
    expect(ids({ search: 'dns resolver' })).toEqual([2]);
    expect(ids({ search: 'dns ipv6' })).toEqual([]);
  });
  it('sorts by the query and counts', () => {
    expect(ids({ sort: 'title', sortDir: 'asc' })).toEqual([1, 2, 3]);
    expect(countFor(es, { read: ['未読'] }, now)).toBe(1);
  });
  it('a projectId that no longer exists matches nothing, never throws', () => {
    expect(() => ids({ projectId: 999 })).not.toThrow();
    expect(ids({ projectId: 999 })).toEqual([]);
    expect(() => ids({ projectId: 999, cite: ['引用する'] })).not.toThrow();
    expect(ids({ projectId: 999, cite: ['引用する'] })).toEqual([]);
  });
});

describe('query helpers', () => {
  it('isFiltering ignores sort, grouping and builtin-only keys', () => {
    expect(isFiltering(DEFAULT_QUERY)).toBe(false);
    expect(isFiltering({ ...DEFAULT_QUERY, search: '  ' })).toBe(false);
    expect(isFiltering({ search: 'x' })).toBe(true);
    expect(isFiltering({ starred: false })).toBe(true);
    expect(isFiltering(builtinQuery('recentAdded', now))).toBe(false);
  });
  it('toSavedQuery drops builtin-only keys and empty values', () => {
    expect(toSavedQuery({ ...builtinQuery('recentAdded', now), read: [], search: '', tags: ['A'] }))
      .toEqual({ sort: 'added', sortDir: 'desc', tags: ['A'] });
  });
  it('isFilteringBeyond compares only filtering fields against the source query', () => {
    const tag = { ...DEFAULT_QUERY, tags: ['DNS'] };
    expect(isFilteringBeyond(tag, tag)).toBe(false);
    expect(isFilteringBeyond({ ...tag, tags: ['DNS', 'IPv6'] }, tag)).toBe(true);
    expect(isFilteringBeyond({ ...tag, sort: 'title', sortDir: 'asc', groupBy: 'year' }, tag)).toBe(false);
    const starred = { ...DEFAULT_QUERY, starred: true };
    expect(isFilteringBeyond({ ...starred, search: '  ', read: [] }, starred)).toBe(false);
    expect(isFilteringBeyond({ ...starred, search: 'x' }, starred)).toBe(true);
    expect(isFilteringBeyond({ ...DEFAULT_QUERY }, starred)).toBe(true);
    expect(isFilteringBeyond({ ...DEFAULT_QUERY, starred: false }, DEFAULT_QUERY)).toBe(true);
    const recent = { ...DEFAULT_QUERY, ...builtinQuery('recentAdded', now) };
    expect(isFilteringBeyond({ ...recent, groupBy: 'year' }, recent)).toBe(false);
  });
  it('withoutFilters keeps sort, grouping and builtin conditions', () => {
    expect(withoutFilters({ ...builtinQuery('recentOpened', now), groupBy: 'year', search: 'x', tags: ['A'] }))
      .toEqual({ sort: 'lastOpened', sortDir: 'desc', groupBy: 'year', openedOnly: true });
  });
  it('sources', () => {
    const saved: SavedFilter[] = [{ id: 5, name: '読むべき', sortOrder: 0, query: { read: ['未読'] } }];
    expect(sourceQuery({ kind: 'saved', id: 5 }, saved, now)).toEqual({ ...DEFAULT_QUERY, read: ['未読'] });
    expect(sourceQuery({ kind: 'tag', name: 'DNS' }, saved, now)).toEqual({ ...DEFAULT_QUERY, tags: ['DNS'] });
    expect(sourceQuery({ kind: 'builtin', id: 'starred' }, saved, now)).toEqual({ ...DEFAULT_QUERY, starred: true });
    expect(sourceLabel({ kind: 'saved', id: 5 }, saved)).toBe('読むべき');
    expect(sourceLabel({ kind: 'tag', name: 'DNS' }, saved)).toBe('# DNS');
    expect(sourceLabel({ kind: 'builtin', id: 'all' }, saved)).toBe('ライブラリ');
    expect(sameSource({ kind: 'builtin', id: 'all' }, { kind: 'builtin', id: 'all' })).toBe(true);
    expect(sameSource({ kind: 'tag', name: 'A' }, { kind: 'tag', name: 'B' })).toBe(false);
  });
  it('describeQuery lists the conditions in Japanese', () => {
    expect(describeQuery(
      { read: ['未読'], tags: ['A', 'B'], tagMode: 'all', projectId: 7, starred: true, priority: [3, 0], yearFrom: 2020 },
      (id) => (id === 7 ? '論文A' : undefined),
    )).toEqual(['読了: 未読', 'タグ: A かつ B', 'プロジェクト: 論文A', '年: 2020〜', '★ あり', '優先度: 高・なし']);
  });
  it('describeQuery renders a deleted project as 「(削除済み)」', () => {
    expect(describeQuery({ projectId: 999 }, () => undefined)).toEqual(['プロジェクト: (削除済み)']);
  });
});

describe('Open Access filter', () => {
  const oa = (status: import('../../src/shared/types').OaStatus) => ({ status, url: '', license: '', checkedAt: status ? '2026-10-01' : '' });
  const list = [entry({ id: 1, oa: oa('gold') }), entry({ id: 2, oa: oa('green') }), entry({ id: 3, oa: oa('closed') }), entry({ id: 4 }), entry({ id: 5, oa: oa('bronze') })];
  it('keeps papers that anyone can read, including other versions', () => {
    expect(applyQuery(list, { oa: true }, new Date()).map((e) => e.id).sort()).toEqual([1, 2, 5]);
    expect(isFiltering({ oa: true })).toBe(true);
    expect(isFiltering({ oa: false })).toBe(false);
    expect(describeQuery({ oa: true }, () => undefined)).toEqual(['Open Access のみ']);
  });
});
