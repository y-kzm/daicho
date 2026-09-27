import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  deleteEntry, ensureUniqueBibkey, getEntriesByIds, getEntry, insertEntry, setCiteState, setFlags, setReadState,
  touchEntry, updateEntry, updateEntryFields,
} from '../../src/worker/db/entries';
import { listTags } from '../../src/worker/db/tags';
import { emptyInput, seedEntry, seedProject } from './helpers';

describe('entries', () => {
  it('insert registers tags and getEntry returns them in order', async () => {
    const id = await seedEntry(env.DB, { title: 'A', tags: ['NDP', 'IPv6'], doi: '10.1/a' }, '2026-02-03');
    const e = await getEntry(env.DB, id);
    expect(e).toMatchObject({ id, title: 'A', added: '2026-02-03', tags: ['NDP', 'IPv6'], doi: '10.1/a', cites: {} });
    expect(await listTags(env.DB)).toEqual(['NDP', 'IPv6']);
    expect(await getEntry(env.DB, 999)).toBeNull();
  });

  it('update replaces fields and tags but keeps added and cites', async () => {
    const id = await seedEntry(env.DB, { title: 'A', tags: ['X'] }, '2026-02-03');
    const p = await seedProject(env.DB, 'P');
    await setCiteState(env.DB, id, p, '引用する');
    await updateEntry(env.DB, id, emptyInput({ title: 'B', tags: ['Y'], read: '斜め読み' }));
    const e = await getEntry(env.DB, id);
    expect(e).toMatchObject({
      title: 'B', tags: ['Y'], read: '斜め読み', added: '2026-02-03',
      cites: { [String(p)]: { state: '引用する', position: 0, memo: '' } },
    });
    await expect(updateEntry(env.DB, 999, emptyInput({ title: 'Z' }))).rejects.toMatchObject({ status: 404 });
  });

  it('delete removes entry, its tag links and cites', async () => {
    const id = await seedEntry(env.DB, { title: 'A', tags: ['X'] });
    await deleteEntry(env.DB, id);
    expect(await getEntry(env.DB, id)).toBeNull();
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM entry_tags').first<{ n: number }>();
    expect(n?.n).toBe(0);
    await expect(deleteEntry(env.DB, id)).rejects.toMatchObject({ status: 404 });
  });

  it('setReadState validates', async () => {
    const id = await seedEntry(env.DB, { title: 'A' });
    await setReadState(env.DB, id, '精読済');
    expect((await getEntry(env.DB, id))?.read).toBe('精読済');
    await expect(setReadState(env.DB, id, 'x')).rejects.toThrow('読了状態が不正です。');
    await expect(setReadState(env.DB, 999, '未読')).rejects.toMatchObject({ status: 404 });
  });

  it('setCiteState appends to the column end, keeps position on same state, moves on change, clears on ""', async () => {
    const a = await seedEntry(env.DB, { title: 'A' });
    const b = await seedEntry(env.DB, { title: 'B' });
    const p = await seedProject(env.DB, 'P');
    const key = String(p);
    await setCiteState(env.DB, a, p, '気になる');
    await setCiteState(env.DB, b, p, '気になる');
    expect((await getEntry(env.DB, a))!.cites).toEqual({ [key]: { state: '気になる', position: 0, memo: '' } });
    expect((await getEntry(env.DB, b))!.cites[key]).toEqual({ state: '気になる', position: 1, memo: '' });
    await env.DB.prepare('UPDATE cites SET memo = ? WHERE entry_id = ?').bind('m', a).run();
    await setCiteState(env.DB, a, p, '気になる');
    expect((await getEntry(env.DB, a))!.cites[key]).toEqual({ state: '気になる', position: 0, memo: 'm' });
    await setCiteState(env.DB, b, p, '引用する');
    expect((await getEntry(env.DB, b))!.cites[key]).toEqual({ state: '引用する', position: 0, memo: '' });
    await setCiteState(env.DB, a, p, '引用する');
    expect((await getEntry(env.DB, a))!.cites[key]).toEqual({ state: '引用する', position: 1, memo: 'm' });
    await setCiteState(env.DB, a, p, '');
    expect((await getEntry(env.DB, a))!.cites).toEqual({});
    await expect(setCiteState(env.DB, a, p, 'bad')).rejects.toThrow('引用状態が不正です。');
    await expect(setCiteState(env.DB, a, 999, '引用する')).rejects.toThrow('プロジェクトが見つかりません。');
    await expect(setCiteState(env.DB, 999, p, '引用する')).rejects.toThrow('エントリが見つかりません。');
  });

  it('ensureUniqueBibkey suffixes a, b, ... and ignores excludeId', async () => {
    const id1 = await seedEntry(env.DB, { title: 'A', bibkey: 'zhang2024' });
    await seedEntry(env.DB, { title: 'B', bibkey: 'zhang2024a' });
    expect(await ensureUniqueBibkey(env.DB, 'zhang2024', null)).toBe('zhang2024b');
    expect(await ensureUniqueBibkey(env.DB, 'zhang2024', id1)).toBe('zhang2024'); // id1を除外すると自分の'zhang2024'が利用可能
    expect(await ensureUniqueBibkey(env.DB, 'other2024', null)).toBe('other2024');
    expect(await ensureUniqueBibkey(env.DB, '', null)).toBe('');
    // Gap case: only 'gap2024b' exists, 'gap2024' is free
    await seedEntry(env.DB, { title: 'C', bibkey: 'gap2024b' });
    expect(await ensureUniqueBibkey(env.DB, 'gap2024', null)).toBe('gap2024');
    // LIKE wildcard issue: 'li2024_x' should not prevent 'li2024' from being used
    await seedEntry(env.DB, { title: 'D', bibkey: 'li2024_x' });
    expect(await ensureUniqueBibkey(env.DB, 'li2024', null)).toBe('li2024');
  });

  it('getEntriesByIds and updateEntryFields', async () => {
    const a = await seedEntry(env.DB, { title: 'A' });
    const b = await seedEntry(env.DB, { title: 'B' });
    await seedEntry(env.DB, { title: 'C' });
    expect((await getEntriesByIds(env.DB, [b, a])).map((e) => e.title)).toEqual(['A', 'B']);
    await updateEntryFields(env.DB, a, { impact_factor: '4.2', country: '日本' });
    expect(await getEntry(env.DB, a)).toMatchObject({ impactFactor: '4.2', country: '日本', core: '' });
  });

  it('setFlags updates starred and priority independently', async () => {
    const id = await seedEntry(env.DB, { title: 'A' });
    await setFlags(env.DB, id, { starred: true });
    expect(await getEntry(env.DB, id)).toMatchObject({ starred: true, priority: 0 });
    await setFlags(env.DB, id, { priority: 2 });
    expect(await getEntry(env.DB, id)).toMatchObject({ starred: true, priority: 2 });
    await setFlags(env.DB, id, {});
    expect(await getEntry(env.DB, id)).toMatchObject({ starred: true, priority: 2 });
    await expect(setFlags(env.DB, 999, { starred: true })).rejects.toThrow('エントリが見つかりません。');
  });

  it('touchEntry stores last_opened_at', async () => {
    const id = await seedEntry(env.DB, { title: 'A' });
    await touchEntry(env.DB, id, '2026-09-27T01:02:03.000Z');
    expect((await getEntry(env.DB, id))!.lastOpenedAt).toBe('2026-09-27T01:02:03.000Z');
    await expect(touchEntry(env.DB, 999, '2026-09-27T01:02:03.000Z')).rejects.toMatchObject({ status: 404 });
  });
});
