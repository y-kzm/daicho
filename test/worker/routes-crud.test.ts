import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../../src/shared/types';
import { createApp } from '../../src/worker/index';
import { mockFetch } from './fetch-mock';
import { seedProject } from './helpers';

const app = createApp();
afterEach(() => vi.unstubAllGlobals());

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await app.request(
    path,
    { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined },
    env,
  );
  return { status: res.status, json: (await res.json()) as T };
}

/** リクエスト本文をそのまま送る (call() は falsy な body を素通りさせられないため) */
async function callRaw<T>(method: string, path: string, rawBody: string): Promise<{ status: number; json: T }> {
  const res = await app.request(
    path,
    { method, headers: { 'content-type': 'application/json' }, body: rawBody },
    env,
  );
  return { status: res.status, json: (await res.json()) as T };
}

async function data(): Promise<AppData> {
  return (await call<AppData>('GET', '/api/data')).json;
}

async function addEntry(body: Record<string, unknown>): Promise<number> {
  return (await call<{ id: number }>('POST', '/api/entries', body)).json.id;
}

describe('CRUD routes', () => {
  it('GET /api/data starts empty', async () => {
    const r = await call<AppData>('GET', '/api/data');
    expect(r.status).toBe(200);
    expect(r.json.entries).toEqual([]);
    expect(r.json.projects).toEqual([]);
    expect(r.json.savedFilters).toEqual([]);
    expect(r.json.readStates).toEqual(['未読', '斜め読み', '精読済']);
    expect('layout' in r.json).toBe(false);
  });

  it('POST /api/entries adds with generated bibkey and returns {id}', async () => {
    mockFetch([{ match: /.*/, status: 404, body: '' }]);
    const r = await call<{ id: number }>('POST', '/api/entries', { title: 'Great Study', year: '2024', tags: ['A'] });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json)).toEqual(['id']);
    const d = await data();
    expect(d.entries[0]).toMatchObject({
      id: r.json.id, title: 'Great Study', bibkey: 'great2024', tags: ['A'], starred: false, priority: 0, lastOpenedAt: '',
    });
    expect(d.entries[0]!.added).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.tags).toEqual(['A']);
    await addEntry({ title: 'Great Again', year: '2024' });
    expect((await data()).entries[1]!.bibkey).toBe('great2024a');
  });

  it('POST /api/entries rejects missing title', async () => {
    const r = await call<{ error: string }>('POST', '/api/entries', { title: '' });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('タイトルは必須です。');
  });

  it('POST /api/entries splits comma-separated tag names', async () => {
    mockFetch([{ match: /.*/, status: 404, body: '' }]);
    const id = await addEntry({ title: 'Tagged', tags: ['x, y'] });
    const d = await data();
    expect(d.entries.find((e) => e.id === id)).toMatchObject({ tags: ['x', 'y'] });
    expect(d.tags).toEqual(expect.arrayContaining(['x', 'y']));
  });

  it('POST /api/entries rejects a null body with 400', async () => {
    const r = await callRaw<{ error: string }>('POST', '/api/entries', 'null');
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('リクエスト本文が不正です。');
  });

  it('PUT / DELETE /api/entries/:id return {}', async () => {
    mockFetch([{ match: /.*/, status: 404, body: '' }]);
    const id = await addEntry({ title: 'X', bibkey: 'x1' });
    const upd = await call('PUT', `/api/entries/${id}`, { title: 'Y', bibkey: 'x1', read: '精読済' });
    expect(upd.json).toEqual({});
    expect((await data()).entries[0]).toMatchObject({ id, title: 'Y', read: '精読済' });
    expect((await call('PUT', '/api/entries/999', { title: 'Z' })).status).toBe(404);
    expect((await call('PUT', '/api/entries/abc', { title: 'Z' })).status).toBe(400);
    expect((await call('DELETE', `/api/entries/${id}`)).json).toEqual({});
    expect((await data()).entries).toEqual([]);
    expect((await call('DELETE', `/api/entries/${id}`)).status).toBe(404);
  });

  it('PATCH read {state} / cite {projectId, state}', async () => {
    mockFetch([{ match: /.*/, status: 404, body: '' }]);
    const id = await addEntry({ title: 'X' });
    const pid = await seedProject(env.DB, 'P');
    expect((await call('PATCH', `/api/entries/${id}/read`, { state: '斜め読み' })).json).toEqual({});
    expect((await data()).entries[0]!.read).toBe('斜め読み');
    const badRead = await call<{ error: string }>('PATCH', `/api/entries/${id}/read`, { state: 'x' });
    expect(badRead.status).toBe(400);
    expect(badRead.json.error).toBe('読了状態が不正です。');
    expect((await call('PATCH', '/api/entries/999/read', { state: '未読' })).status).toBe(404);

    expect((await call('PATCH', `/api/entries/${id}/cite`, { projectId: pid, state: '引用する' })).json).toEqual({});
    expect((await data()).entries[0]!.cites).toEqual({ [String(pid)]: { state: '引用する', position: 0, memo: '' } });
    const badCite = await call<{ error: string }>('PATCH', `/api/entries/${id}/cite`, { projectId: pid, state: 'x' });
    expect(badCite.status).toBe(400);
    expect(badCite.json.error).toBe('引用状態が不正です。');
    expect((await call('PATCH', `/api/entries/${id}/cite`, { projectId: 'x', state: '引用する' })).status).toBe(400);
    expect((await call('PATCH', `/api/entries/${id}/cite`, { projectId: 999, state: '引用する' })).status).toBe(404);
    const noState = await call<{ error: string }>('PATCH', `/api/entries/${id}/cite`, { projectId: pid });
    expect(noState.status).toBe(400);
    expect(noState.json.error).toBe('リクエスト本文が不正です。');
    expect((await data()).entries[0]!.cites).toEqual({ [String(pid)]: { state: '引用する', position: 0, memo: '' } });
    expect((await call('PATCH', `/api/entries/${id}/cite`, { projectId: pid, state: '' })).json).toEqual({});
    expect((await data()).entries[0]!.cites).toEqual({});
  });

  it('PUT /api/layout is gone', async () => {
    expect((await call('PUT', '/api/layout', { layout: '[]' })).status).toBe(404);
  });

  it('tags: add, rename (409 on collision), reorder, delete', async () => {
    await call('POST', '/api/tags', { name: 'A' });
    await call('POST', '/api/tags', { name: 'B' });
    expect((await call<AppData>('PATCH', '/api/tags/A', { name: 'C' })).json.tags).toEqual(['C', 'B']);
    expect((await call('PATCH', '/api/tags/C', { name: 'B' })).status).toBe(409);
    expect((await call<AppData>('PUT', '/api/tags/order', { order: ['B', 'C'] })).json.tags).toEqual(['B', 'C']);
    expect((await call<AppData>('DELETE', '/api/tags/B')).json.tags).toEqual(['C']);
    expect((await call('DELETE', '/api/tags/' + encodeURIComponent('な い'))).status).toBe(404);
  });

  it('rejects non-object JSON bodies (null, array) and invalid JSON with 400', async () => {
    mockFetch([{ match: /.*/, status: 404, body: '' }]);
    const id = await addEntry({ title: 'NullBodyTarget' });

    const tagNull = await callRaw<{ error: string }>('POST', '/api/tags', 'null');
    expect(tagNull.status).toBe(400);
    expect(tagNull.json.error).toBe('リクエスト本文が不正です。');

    const readNull = await callRaw<{ error: string }>('PATCH', `/api/entries/${id}/read`, 'null');
    expect(readNull.status).toBe(400);
    expect(readNull.json.error).toBe('リクエスト本文が不正です。');

    const flagsArray = await callRaw<{ error: string }>('PATCH', `/api/entries/${id}/flags`, '[]');
    expect(flagsArray.status).toBe(400);
    expect(flagsArray.json.error).toBe('リクエスト本文が不正です。');

    const tagInvalidJson = await callRaw<{ error: string }>('POST', '/api/tags', '{bad');
    expect(tagInvalidJson.status).toBe(400);
    expect(tagInvalidJson.json.error).toBe('リクエスト本文が不正です。');
  });
});
