import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AppData, Entry } from '../../src/shared/types';
import { mergeEntries } from '../../src/worker/db/merge';
import { makeEntry, seedCite, seedEntry, seedProject } from './helpers';
import { call, type ErrorBody } from './request';

describe('mergeEntries (pure)', () => {
  const keep = makeEntry({
    id: 1, title: 'Keep', doi: '10.1/k', bibkey: 'keep2024', read: '精読済', tags: ['B', 'A'], note: 'keep note',
    starred: false, priority: 1, cites: { '1': { state: '引用する', position: 3, memo: 'keep memo' } },
  });
  const r1 = makeEntry({
    id: 2, title: 'Dup 1', doi: '10.1/d', bibkey: 'dup2024', read: '未読', tags: ['A', 'C'], note: '  ',
    starred: true, priority: 2,
    cites: { '1': { state: '気になる', position: 0, memo: 'r1 memo' }, '2': { state: '引用候補', position: 5, memo: 'r1 p2' } },
  });
  const r2 = makeEntry({
    id: 3, title: 'Dup 2', tags: ['D'], note: 'r2 note', starred: false, priority: 3,
    cites: { '2': { state: '引用しない', position: 1, memo: 'r2 p2' }, '3': { state: '気になる', position: 4, memo: '' } },
  });

  it('unions tags with keep order first', () => {
    expect(mergeEntries(keep, [r1, r2]).input.tags).toEqual(['B', 'A', 'C', 'D']);
  });

  it('unions cites: keep wins, otherwise the first removed entry wins', () => {
    expect(mergeEntries(keep, [r1, r2]).cites).toEqual({
      '1': { state: '引用する', position: 3, memo: 'keep memo' },
      '2': { state: '引用候補', position: 5, memo: 'r1 p2' },
      '3': { state: '気になる', position: 4, memo: '' },
    });
  });

  it('joins non-blank notes with a blank line', () => {
    expect(mergeEntries(keep, [r1, r2]).input.note).toBe('keep note\n\nr2 note');
    expect(mergeEntries(makeEntry({ note: '' }), [makeEntry({ note: 'x' })]).input.note).toBe('x');
  });

  it('ORs starred and takes the max priority', () => {
    const m = mergeEntries(keep, [r1, r2]);
    expect(m.starred).toBe(true);
    expect(m.priority).toBe(3);
    const n = mergeEntries(makeEntry({ starred: false, priority: 0 }), [makeEntry({ starred: false, priority: 0 })]);
    expect(n).toMatchObject({ starred: false, priority: 0 });
  });

  it('keeps every other column from keep', () => {
    expect(mergeEntries(keep, [r1, r2]).input).toMatchObject({
      title: 'Keep', doi: '10.1/k', bibkey: 'keep2024', read: '精読済', summary: '', url: '', year: '',
    });
  });

  it('fills empty form columns from the first removed entry that has a value', () => {
    const k = makeEntry({ id: 1, title: 'K', doi: '', url: '  ', year: '2024', bibkey: 'k', read: '未読' });
    const x = makeEntry({ id: 2, title: 'X', doi: '', url: 'https://x', year: '2020', journal: 'JX', bibkey: 'x', read: '精読済' });
    const y = makeEntry({ id: 3, title: 'Y', doi: '10.1/y', url: 'https://y', core: 'A*', impactFactor: '3.1' });
    expect(mergeEntries(k, [x, y]).input).toMatchObject({
      title: 'K', bibkey: 'k', read: '未読', doi: '10.1/y', url: 'https://x', year: '2024', journal: 'JX',
      core: 'A*', impactFactor: '3.1', summary: '', country: '', publisher: '', conference: '',
    });
  });

  it('keeps non-empty form columns from keep', () => {
    const k = makeEntry({ id: 1, doi: '10.1/k', url: 'https://k', summary: 'S' });
    const x = makeEntry({ id: 2, doi: '10.1/x', url: 'https://x', summary: 'SX' });
    expect(mergeEntries(k, [x]).input).toMatchObject({ doi: '10.1/k', url: 'https://k', summary: 'S' });
  });

  it('does not mutate its arguments', () => {
    const before = JSON.stringify([keep, r1, r2]);
    const m = mergeEntries(keep, [r1, r2]);
    m.input.tags.push('Z');
    m.cites['1']!.memo = 'changed';
    expect(JSON.stringify([keep, r1, r2])).toBe(before);
  });
});

describe('POST /api/entries/merge', () => {
  function byId(d: AppData, id: number): Entry | undefined {
    return d.entries.find((e) => e.id === id);
  }

  it('merges into keepId, deletes the others and returns AppData', async () => {
    const k = await seedEntry(env.DB, { title: 'Keep', tags: ['A'], note: 'n1' });
    const d = await seedEntry(env.DB, { title: 'Dup', tags: ['B'], note: 'n2' });
    const p = await seedProject(env.DB, 'P');
    await seedCite(env.DB, d, p, '引用候補', 2, 'from dup');
    await call('PATCH', `/api/entries/${d}/flags`, { starred: true, priority: 2 });
    const r = await call<AppData>('POST', '/api/entries/merge', { keepId: k, removeIds: [d] });
    expect(r.status).toBe(200);
    expect(byId(r.json, d)).toBeUndefined();
    expect(byId(r.json, k)).toMatchObject({
      title: 'Keep', tags: ['A', 'B'], note: 'n1\n\nn2', starred: true, priority: 2,
      cites: { [String(p)]: { state: '引用候補', position: 2, memo: 'from dup' } },
    });
    expect(r.json.projects[0]!.count).toBe(1);
  });

  it('ignores keepId inside removeIds', async () => {
    const k = await seedEntry(env.DB, { title: 'Keep' });
    const d = await seedEntry(env.DB, { title: 'Dup' });
    const r = await call<AppData>('POST', '/api/entries/merge', { keepId: k, removeIds: [k, d] });
    expect(r.json.entries.map((e) => e.id)).toEqual([k]);
  });

  it('400 for nothing to merge or bad ids, 404 for missing entries', async () => {
    const k = await seedEntry(env.DB, { title: 'Keep' });
    const empty = await call<ErrorBody>('POST', '/api/entries/merge', { keepId: k, removeIds: [] });
    expect(empty.status).toBe(400);
    expect(empty.json.error).toBe('マージする対象がありません。');
    expect((await call('POST', '/api/entries/merge', { keepId: 'x', removeIds: [2] })).status).toBe(400);
    expect((await call('POST', '/api/entries/merge', { keepId: k, removeIds: 2 })).status).toBe(400);
    const nf = await call<ErrorBody>('POST', '/api/entries/merge', { keepId: k, removeIds: [999] });
    expect(nf.status).toBe(404);
    expect(nf.json.error).toContain('エントリが見つかりません。');
    expect((await call('POST', '/api/entries/merge', { keepId: 999, removeIds: [k] })).status).toBe(404);
  });

  it('rejects more than BULK_MAX removeIds with 400', async () => {
    const k = await seedEntry(env.DB, { title: 'Keep' });
    const removeIds = Array.from({ length: 201 }, (_, i) => i + 100);
    const r = await call<ErrorBody>('POST', '/api/entries/merge', { keepId: k, removeIds });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('一度に扱えるのは 200 件までです。');
  });
});
