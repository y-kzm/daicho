import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AppData, Project } from '../../src/shared/types';
import { seedCite, seedEntry } from './helpers';
import { call, type ErrorBody } from './request';

async function projects(): Promise<Project[]> {
  return (await call<AppData>('GET', '/api/data')).json.projects;
}

async function addProject(name: string): Promise<number> {
  return (await call<{ id: number }>('POST', '/api/projects', { name })).json.id;
}

describe('project routes', () => {
  it('POST /api/projects returns {id}; 400 on bad name, 409 on duplicate', async () => {
    const r = await call<{ id: number }>('POST', '/api/projects', { name: 'P' });
    expect(r.status).toBe(200);
    expect(await projects()).toEqual([{ id: r.json.id, name: 'P', note: '', archived: false, sortOrder: 1, count: 0 }]);
    const bad = await call<ErrorBody>('POST', '/api/projects', { name: 'a:b' });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe('プロジェクト名にカンマとコロンは使えません。');
    expect((await call('POST', '/api/projects', { name: ' ' })).status).toBe(400);
    expect((await call('POST', '/api/projects', { name: 'P' })).status).toBe(409);
  });

  it('PATCH /api/projects/:id updates name / note / archived', async () => {
    const id = await addProject('P');
    expect((await call('PATCH', `/api/projects/${id}`, { name: 'Q', note: 'メモ', archived: true })).json).toEqual({});
    expect((await projects())[0]).toMatchObject({ id, name: 'Q', note: 'メモ', archived: true });
    expect((await call('PATCH', `/api/projects/${id}`, { note: '' })).json).toEqual({});
    expect((await projects())[0]).toMatchObject({ name: 'Q', note: '', archived: true });
    expect((await call('PATCH', `/api/projects/${id}`, { archived: 1 })).status).toBe(400);
    const nf = await call<ErrorBody>('PATCH', '/api/projects/999', { note: 'x' });
    expect(nf.status).toBe(404);
    expect(nf.json.error).toContain('プロジェクトが見つかりません。');
    expect((await call('PATCH', '/api/projects/abc', { note: 'x' })).status).toBe(400);
  });

  it('DELETE /api/projects/:id removes the project and its memberships', async () => {
    const e = await seedEntry(env.DB, { title: 'A' });
    const id = await addProject('P');
    await seedCite(env.DB, e, id, '引用する');
    expect((await call('DELETE', `/api/projects/${id}`)).json).toEqual({});
    const d = (await call<AppData>('GET', '/api/data')).json;
    expect(d.projects).toEqual([]);
    expect(d.entries[0]!.cites).toEqual({});
    expect((await call('DELETE', `/api/projects/${id}`)).status).toBe(404);
  });

  it('PUT /api/projects/order reorders and is not captured by /:id', async () => {
    const a = await addProject('A');
    const b = await addProject('B');
    expect((await call('PUT', '/api/projects/order', { ids: [b, a] })).json).toEqual({});
    expect((await projects()).map((p) => p.id)).toEqual([b, a]);
    const stale = await call<ErrorBody>('PUT', '/api/projects/order', { ids: [a] });
    expect(stale.status).toBe(409);
    expect(stale.json.error).toBe('プロジェクト一覧が変更されています。再読み込みしてやり直してください。');
    expect((await call('PUT', '/api/projects/order', { ids: 'x' })).status).toBe(400);
  });

  it('name-based paths are gone', async () => {
    await addProject('P');
    const r = await call<ErrorBody>('PATCH', '/api/projects/P', { name: 'Q' });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('不正な ID です。');
  });
});

describe('project column routes', () => {
  async function setup(): Promise<{ p: number; a: number; b: number }> {
    const a = await seedEntry(env.DB, { title: 'A' });
    const b = await seedEntry(env.DB, { title: 'B' });
    const p = await addProject('P');
    await seedCite(env.DB, a, p, '気になる', 0);
    await seedCite(env.DB, b, p, '気になる', 1);
    return { p, a, b };
  }

  async function cite(entryId: number, p: number) {
    const e = (await call<AppData>('GET', '/api/data')).json.entries.find((x) => x.id === entryId);
    return e?.cites[String(p)];
  }

  it('PUT /api/projects/:id/order reorders one column', async () => {
    const { p, a, b } = await setup();
    expect((await call('PUT', `/api/projects/${p}/order`, { state: '気になる', entryIds: [b, a] })).json).toEqual({});
    expect(await cite(b, p)).toEqual({ state: '気になる', position: 0, memo: '' });
    expect(await cite(a, p)).toEqual({ state: '気になる', position: 1, memo: '' });
  });

  it('PUT /api/projects/:id/order errors: 409 stale, 400 bad state / body / id, 404 project', async () => {
    const { p, a } = await setup();
    const stale = await call<ErrorBody>('PUT', `/api/projects/${p}/order`, { state: '気になる', entryIds: [a] });
    expect(stale.status).toBe(409);
    expect(stale.json.error).toBe('列の内容が変更されています。再読み込みしてやり直してください。');
    expect((await call('PUT', `/api/projects/${p}/order`, { state: 'x', entryIds: [a] })).status).toBe(400);
    expect((await call('PUT', `/api/projects/${p}/order`, { state: '気になる', entryIds: 'x' })).status).toBe(400);
    expect((await call('PUT', '/api/projects/abc/order', { state: '気になる', entryIds: [a] })).status).toBe(400);
    expect((await call('PUT', '/api/projects/999/order', { state: '気になる', entryIds: [a] })).status).toBe(404);
  });

  it('PATCH /api/projects/:id/entries/:entryId updates memo and state', async () => {
    const { p, a } = await setup();
    expect((await call('PATCH', `/api/projects/${p}/entries/${a}`, { memo: '背景' })).json).toEqual({});
    expect(await cite(a, p)).toEqual({ state: '気になる', position: 0, memo: '背景' });
    expect((await call('PATCH', `/api/projects/${p}/entries/${a}`, { state: '引用する' })).json).toEqual({});
    expect(await cite(a, p)).toEqual({ state: '引用する', position: 0, memo: '背景' });
  });

  it('PATCH /api/projects/:id/entries/:entryId errors: 400 bad state / ids, 404 non-member / project', async () => {
    const { p, a } = await setup();
    const other = await seedEntry(env.DB, { title: 'Other' });
    const bad = await call<ErrorBody>('PATCH', `/api/projects/${p}/entries/${a}`, { state: '' });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe('引用状態が不正です。');
    expect((await call('PATCH', `/api/projects/${p}/entries/x`, { memo: 'm' })).status).toBe(400);
    const nf = await call<ErrorBody>('PATCH', `/api/projects/${p}/entries/${other}`, { memo: 'm' });
    expect(nf.status).toBe(404);
    expect(nf.json.error).toContain('エントリが見つかりません。');
    expect((await call('PATCH', `/api/projects/999/entries/${a}`, { memo: 'm' })).status).toBe(404);
  });
});
