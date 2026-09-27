import { describe, expect, it } from 'vitest';
import { CITE_STATES, type CiteInfo, type CiteState, type Entry } from '../../src/shared/types';
import { columnEntries, moveCard, projectEntryIds } from '../../src/web/lib/kanban';
import { entry } from './helpers';

const P = 7;
const cite = (state: CiteState, position: number): Record<string, CiteInfo> => ({ [String(P)]: { state, position, memo: '' } });
const mk = (id: number, added: string, cites: Record<string, CiteInfo>): Entry =>
  entry({ id, added, cites, starred: false, priority: 0, lastOpenedAt: '' });
const ids = (es: Entry[]) => es.map((e) => e.id);

const DATA: Entry[] = [
  mk(1, '2026-01-01', cite('気になる', 1)),
  mk(2, '2026-03-01', cite('気になる', 0)),
  mk(3, '2026-02-01', cite('気になる', 0)),
  mk(4, '2026-01-05', cite('引用する', 0)),
  mk(5, '2026-01-06', { '99': { state: '気になる', position: 0, memo: '' } }), // 別プロジェクト
  mk(6, '2026-01-07', {}),                                                     // どこにも所属しない
];

describe('columnEntries', () => {
  it('sorts by position asc, then added desc', () => {
    expect(ids(columnEntries(DATA, P, '気になる'))).toEqual([2, 3, 1]);
    expect(ids(columnEntries(DATA, P, '引用する'))).toEqual([4]);
    expect(columnEntries(DATA, P, '引用候補')).toEqual([]);
  });
  it('breaks full ties by id desc', () => {
    const tie = [mk(10, '2026-01-01', cite('引用しない', 0)), mk(11, '2026-01-01', cite('引用しない', 0))];
    expect(ids(columnEntries(tie, P, '引用しない'))).toEqual([11, 10]);
  });
  it('ignores entries outside the project and does not mutate the input', () => {
    expect(ids(columnEntries(DATA, 99, '気になる'))).toEqual([5]);
    expect(ids(DATA)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('stays deterministic when positions duplicate after a merge reused a removed row position', () => {
    // Same position (0), different added dates and ids: position ties break by added desc,
    // and full ties (same position + same added) break by id desc.
    const dup: Entry[] = [
      mk(20, '2026-01-01', cite('気になる', 0)),
      mk(21, '2026-02-01', cite('気になる', 0)),
      mk(22, '2026-02-01', cite('気になる', 0)),
    ];
    expect(ids(columnEntries(dup, P, '気になる'))).toEqual([22, 21, 20]);
  });
});

describe('moveCard', () => {
  it('moves within a column to the drop slot', () => {
    expect(moveCard(DATA, P, 1, '気になる', 0)).toEqual([{ state: '気になる', entryIds: [1, 2, 3] }]);
    expect(moveCard(DATA, P, 2, '気になる', 2)).toEqual([{ state: '気になる', entryIds: [3, 2, 1] }]);
    expect(moveCard(DATA, P, 2, '気になる', 3)).toEqual([{ state: '気になる', entryIds: [3, 1, 2] }]);
  });
  it('is a no-op when dropped on its own place', () => {
    expect(moveCard(DATA, P, 3, '気になる', 1)).toEqual([]);
    expect(moveCard(DATA, P, 3, '気になる', 2)).toEqual([]);
  });
  it('moves across columns to the given index (clamped)', () => {
    expect(moveCard(DATA, P, 2, '引用する', 0)).toEqual([
      { state: '気になる', entryIds: [3, 1] },
      { state: '引用する', entryIds: [2, 4] },
    ]);
    expect(moveCard(DATA, P, 2, '引用する', 99)).toEqual([
      { state: '気になる', entryIds: [3, 1] },
      { state: '引用する', entryIds: [4, 2] },
    ]);
    expect(moveCard(DATA, P, 2, '引用する', -5)[1]).toEqual({ state: '引用する', entryIds: [2, 4] });
  });
  it('returns the emptied source column too', () => {
    expect(moveCard(DATA, P, 4, '引用候補', 0)).toEqual([
      { state: '引用する', entryIds: [] },
      { state: '引用候補', entryIds: [4] },
    ]);
  });
  it('ignores entries that are not in the project', () => {
    expect(moveCard(DATA, P, 5, '引用する', 0)).toEqual([]);
    expect(moveCard(DATA, P, 6, '引用する', 0)).toEqual([]);
    expect(moveCard(DATA, P, 42, '引用する', 0)).toEqual([]);
  });
});

describe('projectEntryIds', () => {
  it('concatenates columns in the given state order', () => {
    expect(projectEntryIds(DATA, P, CITE_STATES)).toEqual([2, 3, 1, 4]);
    expect(projectEntryIds(DATA, P, ['引用する'])).toEqual([4]);
    expect(projectEntryIds(DATA, 12345, CITE_STATES)).toEqual([]);
  });
});
