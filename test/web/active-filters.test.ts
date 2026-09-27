import { describe, expect, it } from 'vitest';
import type { FilterQuery } from '../../src/shared/types';
import { activeFilters, isFilteringBeyond } from '../../src/web/lib/smart';

const name = (id: number) => (id === 1 ? 'Survey' : undefined);
const labels = (q: FilterQuery, base: FilterQuery = {}) => activeFilters(q, base, name).map((c) => c.label);

describe('activeFilters', () => {
  it('is empty without filters, and ignores sort and grouping', () => {
    expect(labels({})).toEqual([]);
    expect(labels({ sort: 'year', sortDir: 'asc', groupBy: 'read' })).toEqual([]);
    expect(labels({ search: '   ' })).toEqual([]);
  });

  it('lists one chip per value or condition, in a stable order', () => {
    const q: FilterQuery = {
      search: ' ndp ', read: ['未読', '精読済'], tags: ['IPv6', 'NDP'], tagMode: 'all', projectId: 1,
      cite: ['引用する'], yearFrom: 2020, starred: true, priority: [3, 0],
    };
    expect(labels(q)).toEqual([
      '「ndp」', '未読', '精読済', '# IPv6', '# NDP', 'タグをすべて含む', 'プロジェクト: Survey',
      '引用する', '2020〜 年', '★ あり', '優先度 高', '優先度 なし',
    ]);
  });

  it('names a deleted project and a starred=false filter', () => {
    expect(labels({ projectId: 9 })).toEqual(['プロジェクト: (削除済み)']);
    expect(labels({ starred: false })).toEqual(['★ なし']);
    expect(labels({ yearTo: 2019 })).toEqual(['〜2019 年']);
  });

  it('hides what the source itself requires', () => {
    expect(labels({ tags: ['IPv6'] }, { tags: ['IPv6'] })).toEqual([]);
    expect(labels({ tags: ['IPv6', 'NDP'] }, { tags: ['IPv6'] })).toEqual(['# NDP']);
    expect(labels({ starred: true, read: ['未読'] }, { starred: true })).toEqual(['未読']);
  });

  it('shows the "all tags" chip only when it changes the result', () => {
    expect(labels({ tags: ['IPv6'], tagMode: 'all' })).toEqual(['# IPv6']);
    expect(labels({ tagMode: 'all' })).toEqual([]);
  });

  it('clears exactly one condition and leaves the rest', () => {
    const q: FilterQuery = { read: ['未読', '精読済'], tags: ['IPv6'], yearFrom: 2020, yearTo: 2024, sort: 'year' };
    const chips = activeFilters(q, {}, name);
    const by = (key: string) => chips.find((c) => c.key === key)!;
    expect(by('read:未読').clear(q)).toEqual({ ...q, read: ['精読済'] });
    expect(by('tag:IPv6').clear(q)).toEqual({ ...q, tags: undefined });
    expect(by('year').clear(q)).toEqual({ ...q, yearFrom: undefined, yearTo: undefined });
  });

  it('returns to the source condition, not to nothing', () => {
    const base: FilterQuery = { tags: ['IPv6'] };
    const q: FilterQuery = { tags: ['IPv6', 'NDP'] };
    const next = activeFilters(q, base, name)[0]!.clear(q);
    expect(next.tags).toEqual(['IPv6']);
    expect(isFilteringBeyond(next, base)).toBe(false);
  });

  it('clearing every chip leaves nothing beyond the source', () => {
    const base: FilterQuery = { starred: true };
    let q: FilterQuery = { starred: true, search: 'x', read: ['未読'], tags: ['A', 'B'], tagMode: 'all', cite: ['気になる'], priority: [2], yearTo: 2020 };
    for (let i = 0; i < 20; i++) {
      const chips = activeFilters(q, base, name);
      if (!chips.length) break;
      q = chips[0]!.clear(q);
    }
    expect(activeFilters(q, base, name)).toEqual([]);
    expect(isFilteringBeyond(q, base)).toBe(false);
  });
});

describe('normalizeTagMode', () => {
  it('drops "all" when one tag or none is left', async () => {
    const { normalizeTagMode } = await import('../../src/web/lib/smart');
    expect(normalizeTagMode({ tags: ['A'], tagMode: 'all' }, {})).toEqual({ tags: ['A'], tagMode: undefined });
    expect(normalizeTagMode({ tagMode: 'all' }, {})).toEqual({ tagMode: undefined });
    const two: FilterQuery = { tags: ['A', 'B'], tagMode: 'all' };
    expect(normalizeTagMode(two, {})).toBe(two);
  });

  it('keeps the mode that the source itself uses', async () => {
    const { normalizeTagMode } = await import('../../src/web/lib/smart');
    const q: FilterQuery = { tags: ['A'], tagMode: 'all' };
    expect(normalizeTagMode(q, { tags: ['A', 'B'], tagMode: 'all' })).toBe(q);
  });

  it('removing the added tag in a tag source leaves nothing beyond the source', () => {
    const base: FilterQuery = { tags: ['A'] };
    const q: FilterQuery = { tags: ['A', 'B'], tagMode: 'all' };
    const chip = activeFilters(q, base, name).find((c) => c.key === 'tag:B')!;
    const next = chip.clear(q);
    expect(next.tags).toEqual(['A']);
    expect(next.tagMode).toBeUndefined();
    expect(isFilteringBeyond(next, base)).toBe(false);
  });
});
