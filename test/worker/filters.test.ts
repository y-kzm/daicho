import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { FilterQuery } from '../../src/shared/types';
import {
  addFilter, deleteFilter, listFilters, parseFilterQuery, reorderFilters, updateFilter,
} from '../../src/worker/db/filters';

const MSG = 'フィルタ条件が不正です。';

describe('parseFilterQuery', () => {
  it('accepts every known key with the right type', () => {
    const q: FilterQuery = {
      search: 'ipv6', read: ['未読', '精読済'], tags: ['A', 'B'], tagMode: 'all', projectId: 3,
      cite: ['引用する'], yearFrom: 2020, yearTo: 2024, starred: true, priority: [0, 3], unfiled: false,
      sort: 'lastOpened', sortDir: 'asc', groupBy: 'firstTag',
    };
    expect(parseFilterQuery(q)).toEqual(q);
  });

  it('accepts an empty object and returns a copy', () => {
    const input = { search: 'x' };
    const out = parseFilterQuery(input);
    expect(out).toEqual({ search: 'x' });
    expect(out).not.toBe(input);
    expect(parseFilterQuery({})).toEqual({});
  });

  it('rejects non-objects', () => {
    for (const bad of [null, undefined, 'x', 1, [], [{ search: 'x' }]]) {
      expect(() => parseFilterQuery(bad)).toThrow(MSG);
    }
  });

  it('rejects unknown keys', () => {
    expect(() => parseFilterQuery({ layout: '[]' })).toThrow(MSG);
    expect(() => parseFilterQuery({ search: 'x', Search: 'y' })).toThrow(MSG);
  });

  it('rejects wrong types and out-of-range values per key', () => {
    const bad: Record<string, unknown>[] = [
      { search: 1 },
      { read: '未読' }, { read: ['x'] },
      { tags: 'A' }, { tags: [1] },
      { tagMode: 'some' },
      { projectId: 0 }, { projectId: '3' }, { projectId: 1.5 },
      { cite: ['未判断'] },
      { yearFrom: '2020' }, { yearTo: 2020.5 },
      { starred: 'true' }, { unfiled: 1 },
      { priority: 2 }, { priority: [4] }, { priority: ['1'] },
      { sort: 'custom' }, { sortDir: 'up' }, { groupBy: 'project' },
    ];
    for (const q of bad) expect(() => parseFilterQuery(q), JSON.stringify(q)).toThrow(MSG);
  });

  it('throws a 400 AppError', () => {
    let err: unknown;
    try {
      parseFilterQuery({ nope: 1 });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ status: 400, message: MSG });
  });
});

describe('saved filter CRUD', () => {
  it('addFilter trims the name, stores the validated query and appends', async () => {
    const a = await addFilter(env.DB, ' スター付き ', { starred: true });
    const b = await addFilter(env.DB, '2024 年以降', { yearFrom: 2024 });
    expect(await listFilters(env.DB)).toEqual([
      { id: a, name: 'スター付き', sortOrder: 1, query: { starred: true } },
      { id: b, name: '2024 年以降', sortOrder: 2, query: { yearFrom: 2024 } },
    ]);
    await expect(addFilter(env.DB, '', {})).rejects.toThrow('フィルタ名を入力してください。');
    await expect(addFilter(env.DB, 'x', { bogus: 1 })).rejects.toThrow('フィルタ条件が不正です。');
    await expect(addFilter(env.DB, 'x', undefined)).rejects.toThrow('フィルタ条件が不正です。');
  });

  it('updateFilter patches name and/or query', async () => {
    const id = await addFilter(env.DB, 'F', { starred: true });
    await updateFilter(env.DB, id, { name: 'G' });
    expect((await listFilters(env.DB))[0]).toMatchObject({ name: 'G', query: { starred: true } });
    await updateFilter(env.DB, id, { query: { read: ['未読'] } });
    expect((await listFilters(env.DB))[0]).toMatchObject({ name: 'G', query: { read: ['未読'] } });
    await expect(updateFilter(env.DB, id, { query: { read: 'x' } })).rejects.toThrow('フィルタ条件が不正です。');
    await expect(updateFilter(env.DB, id, { name: ' ' })).rejects.toThrow('フィルタ名を入力してください。');
    await expect(updateFilter(env.DB, 999, { name: 'H' })).rejects.toThrow('フィルタが見つかりません。');
  });

  it('deleteFilter removes one filter', async () => {
    const id = await addFilter(env.DB, 'F', {});
    await deleteFilter(env.DB, id);
    expect(await listFilters(env.DB)).toEqual([]);
    await expect(deleteFilter(env.DB, id)).rejects.toMatchObject({ status: 404 });
  });

  it('reorderFilters requires exactly the current id set', async () => {
    const a = await addFilter(env.DB, 'A', {});
    const b = await addFilter(env.DB, 'B', {});
    await reorderFilters(env.DB, [b, a]);
    expect((await listFilters(env.DB)).map((f) => f.id)).toEqual([b, a]);
    for (const bad of [[a], [a, a], [a, b, 999]]) {
      await expect(reorderFilters(env.DB, bad)).rejects.toMatchObject({ status: 409 });
    }
  });
});
