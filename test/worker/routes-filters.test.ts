import { describe, expect, it } from 'vitest';
import type { AppData, SavedFilter } from '../../src/shared/types';
import { call, type ErrorBody } from './request';

async function filters(): Promise<SavedFilter[]> {
  return (await call<AppData>('GET', '/api/data')).json.savedFilters;
}

async function addFilter(name: string, query: unknown): Promise<number> {
  return (await call<{ id: number }>('POST', '/api/filters', { name, query })).json.id;
}

describe('filter routes', () => {
  it('POST /api/filters returns {id} and shows up in AppData', async () => {
    const r = await call<{ id: number }>('POST', '/api/filters', { name: '精読済', query: { read: ['精読済'], sort: 'title' } });
    expect(r.status).toBe(200);
    expect(await filters()).toEqual([{ id: r.json.id, name: '精読済', sortOrder: 1, query: { read: ['精読済'], sort: 'title' } }]);
  });

  it('POST /api/filters rejects bad query / name with 400', async () => {
    const q = await call<ErrorBody>('POST', '/api/filters', { name: 'F', query: { unknownKey: true } });
    expect(q.status).toBe(400);
    expect(q.json.error).toBe('フィルタ条件が不正です。');
    const t = await call<ErrorBody>('POST', '/api/filters', { name: 'F', query: { starred: 'yes' } });
    expect(t.status).toBe(400);
    expect(t.json.error).toBe('フィルタ条件が不正です。');
    const n = await call<ErrorBody>('POST', '/api/filters', { name: '', query: {} });
    expect(n.status).toBe(400);
    expect(n.json.error).toBe('フィルタ名を入力してください。');
  });

  it('PATCH /api/filters/:id updates; 400 / 404 on errors', async () => {
    const id = await addFilter('F', {});
    expect((await call('PATCH', `/api/filters/${id}`, { name: 'G', query: { unfiled: true } })).json).toEqual({});
    expect((await filters())[0]).toMatchObject({ id, name: 'G', query: { unfiled: true } });
    expect((await call('PATCH', `/api/filters/${id}`, { query: { groupBy: 'author' } })).status).toBe(400);
    const nf = await call<ErrorBody>('PATCH', '/api/filters/999', { name: 'H' });
    expect(nf.status).toBe(404);
    expect(nf.json.error).toContain('フィルタが見つかりません。');
    expect((await call('PATCH', '/api/filters/abc', { name: 'H' })).status).toBe(400);
  });

  it('DELETE /api/filters/:id', async () => {
    const id = await addFilter('F', {});
    expect((await call('DELETE', `/api/filters/${id}`)).json).toEqual({});
    expect(await filters()).toEqual([]);
    expect((await call('DELETE', `/api/filters/${id}`)).status).toBe(404);
  });

  it('PUT /api/filters/order reorders and is not captured by /:id', async () => {
    const a = await addFilter('A', {});
    const b = await addFilter('B', {});
    expect((await call('PUT', '/api/filters/order', { ids: [b, a] })).json).toEqual({});
    expect((await filters()).map((f) => f.id)).toEqual([b, a]);
    const stale = await call<ErrorBody>('PUT', '/api/filters/order', { ids: [a] });
    expect(stale.status).toBe(409);
    expect(stale.json.error).toBe('フィルタ一覧が変更されています。再読み込みしてやり直してください。');
    expect((await call('PUT', '/api/filters/order', { ids: null })).status).toBe(400);
  });
});
