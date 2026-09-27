import { describe, expect, it } from 'vitest';
import { applyQuery, countFor } from '../../src/web/lib/smart';
import { countTags, scopedKey, scopeEntries, scopeQuery, scopeTags } from '../../src/web/lib/scope';
import { searchPalette } from '../../src/web/lib/palette';
import { effectiveGroup, groupEntries, groupKeysFor } from '../../src/web/lib/table';
import { appData, entry } from './helpers';

const cite = (state: '気になる' | '引用候補' | '引用する' | '引用しない', position = 0) => ({ state, position, memo: '' });
const es = [
  entry({ id: 1, title: 'Alpha routing', tags: ['Net', 'Sec'], cites: { 1: cite('引用する'), 2: cite('気になる') } }),
  entry({ id: 2, title: 'Alpha scanning', tags: ['Sec'], cites: { 2: cite('引用候補') } }),
  entry({ id: 3, title: 'Beta', tags: [], cites: {} }),
  entry({ id: 4, title: 'Alpha privacy', tags: ['Priv'], cites: { 1: cite('気になる') } }),
];
const now = new Date('2026-09-28T00:00:00');

describe('scopeEntries / scopeTags', () => {
  it('returns the same array for the whole library', () => {
    expect(scopeEntries(es, null)).toBe(es);
    expect(scopeTags(['Net', 'Sec', 'Priv', 'Unused'], es, null)).toEqual(['Net', 'Sec', 'Priv', 'Unused']);
  });
  it('keeps only members of the project', () => {
    expect(scopeEntries(es, 1).map((e) => e.id)).toEqual([1, 4]);
    expect(scopeEntries(es, 2).map((e) => e.id)).toEqual([1, 2]);
    expect(scopeEntries(es, 99)).toEqual([]);
  });
  it('lists only tags used inside the project, in the global order, with scoped counts', () => {
    const inside = scopeEntries(es, 2);
    expect(scopeTags(['Priv', 'Sec', 'Net', 'Unused'], inside, 2)).toEqual(['Sec', 'Net']);
    expect([...countTags(inside)]).toEqual([['Net', 1], ['Sec', 2]]);
  });
});

describe('scopeQuery', () => {
  it('leaves the query untouched for the whole library', () => {
    const q = { cite: ['引用する' as const], unfiled: true };
    expect(scopeQuery(q, null)).toBe(q);
  });
  it('pins the project so that the cite filter looks at this project only', () => {
    // 論文 1 はプロジェクト 1 で「引用する」、プロジェクト 2 では「気になる」
    const q = scopeQuery({ cite: ['引用する' as const] }, 2);
    expect(applyQuery(scopeEntries(es, 2), q, now)).toEqual([]);
    expect(applyQuery(scopeEntries(es, 1), scopeQuery({ cite: ['引用する' as const] }, 1), now).map((e) => e.id)).toEqual([1]);
  });
  it('overrides a project stored in a saved filter and drops "unfiled"', () => {
    const q = scopeQuery({ projectId: 1, unfiled: true }, 2);
    expect(q.projectId).toBe(2);
    expect(q.unfiled).toBeUndefined();
    expect(countFor(scopeEntries(es, 2), q, now)).toBe(2);
  });
});

describe('scopedKey', () => {
  it('keeps the old key for the whole library and separates projects', () => {
    expect(scopedKey('daicho.library.query', null)).toBe('daicho.library.query');
    expect(scopedKey('daicho.library.query', 3)).toBe('daicho.library.query.p3');
  });
});

describe('group by cite state', () => {
  it('is offered only inside a project', () => {
    expect(groupKeysFor(undefined)).not.toContain('cite');
    expect(groupKeysFor(1)).toContain('cite');
    expect(effectiveGroup('cite', undefined)).toBe('none');
    expect(effectiveGroup('cite', 1)).toBe('cite');
    expect(effectiveGroup('year', undefined)).toBe('year');
  });
  it('orders groups like the board columns', () => {
    const g = groupEntries(scopeEntries(es, 1), 'cite', 1);
    expect(g.map((x) => [x.key, x.entries.map((e) => e.id)])).toEqual([['気になる', [4]], ['引用する', [1]]]);
  });
  it('falls back to one group without a project', () => {
    expect(groupEntries(es, 'cite')).toEqual([{ key: '', label: '', entries: es }]);
  });
});

describe('searchPalette with a scope', () => {
  const data = appData(es);
  it('does not mark anything without a scope', () => {
    const items = searchPalette('alpha', data, []);
    expect(items.every((i) => i.kind === 'entry' && i.outside === undefined)).toBe(true);
    expect(items.map((i) => (i.kind === 'entry' ? i.id : 0))).toEqual([1, 2, 4]);
  });
  it('lists project members first and marks the others', () => {
    const items = searchPalette('alpha', data, [], 30, 2);
    expect(items.map((i) => (i.kind === 'entry' ? [i.id, i.outside === true] : []))).toEqual([[1, false], [2, false], [4, true]]);
  });
  it('still ranks a better match above a project member', () => {
    const items = searchPalette('beta', appData([...es, entry({ id: 5, title: 'Not beta here', cites: { 2: cite('気になる') } })]), [], 30, 2);
    expect(items.map((i) => (i.kind === 'entry' ? i.id : 0))).toEqual([3, 5]);
  });
});
