import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AppData, Entry } from '../../src/shared/types';
import { seedEntry } from './helpers';
import { call, type ErrorBody } from './request';

async function entryOf(id: number): Promise<Entry | undefined> {
  return (await call<AppData>('GET', '/api/data')).json.entries.find((e) => e.id === id);
}

describe('PATCH /api/entries/:id/flags', () => {
  it('sets starred and priority independently', async () => {
    const id = await seedEntry(env.DB, { title: 'A' });
    expect((await call('PATCH', `/api/entries/${id}/flags`, { starred: true })).json).toEqual({});
    expect(await entryOf(id)).toMatchObject({ starred: true, priority: 0 });
    expect((await call('PATCH', `/api/entries/${id}/flags`, { priority: 3 })).json).toEqual({});
    expect(await entryOf(id)).toMatchObject({ starred: true, priority: 3 });
    await call('PATCH', `/api/entries/${id}/flags`, { starred: false, priority: 0 });
    expect(await entryOf(id)).toMatchObject({ starred: false, priority: 0 });
  });

  it('rejects bad values with 400 and unknown ids with 404', async () => {
    const id = await seedEntry(env.DB, { title: 'A' });
    const p = await call<ErrorBody>('PATCH', `/api/entries/${id}/flags`, { priority: 4 });
    expect(p.status).toBe(400);
    expect(p.json.error).toBe('優先度が不正です。');
    const s = await call<ErrorBody>('PATCH', `/api/entries/${id}/flags`, { starred: 'yes' });
    expect(s.status).toBe(400);
    expect(s.json.error).toBe('リクエスト本文が不正です。');
    const nf = await call<ErrorBody>('PATCH', '/api/entries/999/flags', { starred: true });
    expect(nf.status).toBe(404);
    expect(nf.json.error).toContain('エントリが見つかりません。');
    expect((await call('PATCH', '/api/entries/abc/flags', { starred: true })).status).toBe(400);
  });
});

describe('POST /api/entries/:id/touch', () => {
  it('stores and returns an ISO timestamp', async () => {
    const id = await seedEntry(env.DB, { title: 'A' });
    const r = await call<{ lastOpenedAt: string }>('POST', `/api/entries/${id}/touch`);
    expect(r.status).toBe(200);
    expect(r.json.lastOpenedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect((await entryOf(id))!.lastOpenedAt).toBe(r.json.lastOpenedAt);
  });

  it('404 for unknown ids, 400 for bad ids', async () => {
    expect((await call('POST', '/api/entries/999/touch')).status).toBe(404);
    expect((await call('POST', '/api/entries/0/touch')).status).toBe(400);
  });
});
