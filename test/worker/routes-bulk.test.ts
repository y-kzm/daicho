import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, Entry } from '../../src/shared/types';
import { bulkStatements } from '../../src/worker/db/entries';
import { seedCite, seedEntry, seedProject } from './helpers';
import { call, type ErrorBody } from './request';

let a = 0;
let b = 0;
let c = 0;

beforeEach(async () => {
  a = await seedEntry(env.DB, { title: 'A', tags: ['Old', 'Keep'] });
  b = await seedEntry(env.DB, { title: 'B', tags: ['Keep'] });
  c = await seedEntry(env.DB, { title: 'C' });
});

function byId(d: AppData, id: number): Entry {
  const e = d.entries.find((x) => x.id === id);
  if (!e) throw new Error('missing entry ' + id);
  return e;
}

async function bulk(ids: unknown, op: unknown) {
  return call<AppData & ErrorBody>('POST', '/api/entries/bulk', { ids, op });
}

describe('POST /api/entries/bulk', () => {
  it('tags: removes then appends, registers new tags, returns AppData', async () => {
    const r = await bulk([a, b], { type: 'tags', add: ['New', 'Keep'], remove: ['Old'] });
    expect(r.status).toBe(200);
    expect(byId(r.json, a).tags).toEqual(['Keep', 'New']);
    expect(byId(r.json, b).tags).toEqual(['Keep', 'New']);
    expect(byId(r.json, c).tags).toEqual([]);
    expect(r.json.tags).toEqual(['Old', 'Keep', 'New']);
  });

  it('read: overwrites state; rejects an unknown state', async () => {
    const r = await bulk([a, c], { type: 'read', state: '精読済' });
    expect(byId(r.json, a).read).toBe('精読済');
    expect(byId(r.json, b).read).toBe('未読');
    expect(byId(r.json, c).read).toBe('精読済');
    const bad = await bulk([a], { type: 'read', state: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe('読了状態が不正です。');
  });

  it('flags: sets given flags and keeps omitted ones; rejects bad priority', async () => {
    await call('PATCH', `/api/entries/${a}/flags`, { priority: 1 });
    const r1 = await bulk([a, b], { type: 'flags', starred: true });
    expect(byId(r1.json, a)).toMatchObject({ starred: true, priority: 1 });
    expect(byId(r1.json, b)).toMatchObject({ starred: true, priority: 0 });
    const r2 = await bulk([a, b], { type: 'flags', priority: 3 });
    expect(byId(r2.json, a)).toMatchObject({ starred: true, priority: 3 });
    const bad = await bulk([a], { type: 'flags', priority: 7 });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe('優先度が不正です。');
  });

  it('project: appends new members to the column end in id order and keeps existing positions', async () => {
    const p = await seedProject(env.DB, 'P');
    await seedCite(env.DB, a, p, '気になる', 0, 'memo-a');
    const r = await bulk([c, b, a], { type: 'project', projectId: p, state: '気になる' });
    const key = String(p);
    expect(byId(r.json, a).cites[key]).toEqual({ state: '気になる', position: 0, memo: 'memo-a' });
    expect(byId(r.json, b).cites[key]).toEqual({ state: '気になる', position: 1, memo: '' });
    expect(byId(r.json, c).cites[key]).toEqual({ state: '気になる', position: 2, memo: '' });
    expect(r.json.projects[0]!.count).toBe(3);
  });

  it('project: 404 for a missing project, 400 for a bad state or project id', async () => {
    const nf = await bulk([a], { type: 'project', projectId: 999, state: '気になる' });
    expect(nf.status).toBe(404);
    expect(nf.json.error).toContain('プロジェクトが見つかりません。');
    const p = await seedProject(env.DB, 'P');
    const badState = await bulk([a], { type: 'project', projectId: p, state: '' });
    expect(badState.status).toBe(400);
    expect(badState.json.error).toBe('引用状態が不正です。');
    expect((await bulk([a], { type: 'project', projectId: 'x', state: '気になる' })).status).toBe(400);
  });

  it('delete: removes entries and their cites', async () => {
    const p = await seedProject(env.DB, 'P');
    await seedCite(env.DB, a, p, '引用する');
    const r = await bulk([a, b], { type: 'delete' });
    expect(r.json.entries.map((e) => e.id)).toEqual([c]);
    expect(r.json.projects[0]!.count).toBe(0);
  });

  it('ignores unknown ids but 404s when none exist', async () => {
    const r = await bulk([a, 999], { type: 'read', state: '斜め読み' });
    expect(r.status).toBe(200);
    expect(byId(r.json, a).read).toBe('斜め読み');
    const nf = await bulk([998, 999], { type: 'read', state: '斜め読み' });
    expect(nf.status).toBe(404);
    expect(nf.json.error).toContain('エントリが見つかりません。');
  });

  it('rejects more than BULK_MAX ids with 400', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => i + 1);
    const r = await bulk(ids, { type: 'delete' });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('一度に扱えるのは 200 件までです。');
    const ok = await bulk([...Array.from({ length: 199 }, (_, i) => i + 1000), a], { type: 'read', state: '精読済' });
    expect(ok.status).toBe(200);
  });

  it('rejects malformed bodies with 400', async () => {
    expect((await bulk('1,2', { type: 'delete' })).status).toBe(400);
    expect((await bulk([], { type: 'delete' })).status).toBe(400);
    const unknown = await bulk([a], { type: 'explode' });
    expect(unknown.status).toBe(400);
    expect(unknown.json.error).toBe('一括操作の種類が不正です。');
    expect((await bulk([a], null)).status).toBe(400);
    const badId = await bulk([a, 'x'], { type: 'read', state: '精読済' });
    expect(badId.status).toBe(400);
    expect(badId.json.error).toBe('リクエスト本文が不正です。');
  });
});

describe('bulkStatements (set-based)', () => {
  const ids = Array.from({ length: 200 }, (_, i) => i + 1);

  it('keeps the statement count independent of the number of ids', () => {
    expect(bulkStatements(env.DB, ids, { type: 'read', state: '精読済' }).length).toBeLessThanOrEqual(2);
    expect(bulkStatements(env.DB, ids, { type: 'flags', starred: true, priority: 2 }).length).toBeLessThanOrEqual(2);
    expect(bulkStatements(env.DB, ids, { type: 'delete' }).length).toBeLessThanOrEqual(2);
    expect(bulkStatements(env.DB, ids, { type: 'project', projectId: 1, state: '気になる' }).length).toBeLessThanOrEqual(2);
    const add = ['X', 'Y', 'Z'];
    expect(bulkStatements(env.DB, ids, { type: 'tags', add, remove: ['Old'] }).length).toBeLessThanOrEqual(2 * add.length + 1);
  });

  async function cites(p: number): Promise<{ entry_id: number; state: string; position: number; memo: string }[]> {
    const r = await env.DB
      .prepare('SELECT entry_id, state, position, memo FROM cites WHERE project_id = ? ORDER BY entry_id')
      .bind(p)
      .all<{ entry_id: number; state: string; position: number; memo: string }>();
    return r.results;
  }

  it('project: same-state members stay put; moved and new members get distinct positions above the column max', async () => {
    const d = await seedEntry(env.DB, { title: 'D' });
    const e = await seedEntry(env.DB, { title: 'E' });
    const p = await seedProject(env.DB, 'P');
    await seedCite(env.DB, a, p, '引用する', 5, 'same');
    await seedCite(env.DB, b, p, '気になる', 0, 'moved-b');
    await seedCite(env.DB, d, p, '引用候補', 2, 'moved-d');
    await seedCite(env.DB, e, p, '引用する', 7, 'untouched');
    const r = await bulk([a, b, c, d], { type: 'project', projectId: p, state: '引用する' });
    expect(r.status).toBe(200);
    const rows = await cites(p);
    const row = (id: number) => rows.find((x) => x.entry_id === id)!;
    expect(row(a)).toEqual({ entry_id: a, state: '引用する', position: 5, memo: 'same' });
    expect(row(e)).toEqual({ entry_id: e, state: '引用する', position: 7, memo: 'untouched' });
    expect(row(b)).toMatchObject({ state: '引用する', memo: 'moved-b' });
    expect(row(d)).toMatchObject({ state: '引用する', memo: 'moved-d' });
    expect(row(c)).toMatchObject({ state: '引用する', memo: '' });
    const placed = [row(b).position, row(c).position, row(d).position];
    for (const pos of placed) expect(pos).toBeGreaterThan(7);
    expect(new Set(placed).size).toBe(3);
    const column = rows.filter((x) => x.state === '引用する').map((x) => x.position);
    expect(new Set(column).size).toBe(column.length);
  });

  async function tagRows(id: number): Promise<{ name: string; position: number }[]> {
    const r = await env.DB
      .prepare('SELECT t.name, et.position FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entry_id = ? ORDER BY et.position')
      .bind(id)
      .all<{ name: string; position: number }>();
    return r.results;
  }

  it('tags: appends after each entry\'s current max position with distinct increasing positions', async () => {
    await env.DB.prepare('UPDATE entry_tags SET position = 4 WHERE entry_id = ?').bind(b).run();
    const r = await bulk([a, b, c], { type: 'tags', add: ['N1', 'N2'], remove: [] });
    expect(r.status).toBe(200);
    expect(await tagRows(a)).toEqual([
      { name: 'Old', position: 0 }, { name: 'Keep', position: 1 }, { name: 'N1', position: 2 }, { name: 'N2', position: 3 },
    ]);
    expect(await tagRows(b)).toEqual([{ name: 'Keep', position: 4 }, { name: 'N1', position: 5 }, { name: 'N2', position: 6 }]);
    expect(await tagRows(c)).toEqual([{ name: 'N1', position: 0 }, { name: 'N2', position: 1 }]);
    expect(byId(r.json, a).tags).toEqual(['Old', 'Keep', 'N1', 'N2']);
  });
});
