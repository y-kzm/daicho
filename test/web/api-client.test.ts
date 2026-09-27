import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, BIBTEX_LIMIT, BIBTEX_LIMIT_MESSAGE, BULK_LIMIT_MESSAGE } from '../../src/web/api';
import { appData } from './helpers';

function mockFetch(body: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function lastRequest(fn: ReturnType<typeof mockFetch>) {
  const call = fn.mock.calls.at(-1);
  if (!call) throw new Error('fetch was not called');
  const [url, init] = call;
  return { url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('api client (library-ux)', () => {
  it('setRead sends {state}', async () => {
    const f = mockFetch({});
    await api.setRead(3, '精読済');
    expect(lastRequest(f)).toEqual({ url: '/api/entries/3/read', method: 'PATCH', body: { state: '精読済' } });
  });
  it('setCite sends projectId and state', async () => {
    const f = mockFetch({});
    await api.setCite(3, 7, '引用する');
    expect(lastRequest(f)).toEqual({ url: '/api/entries/3/cite', method: 'PATCH', body: { projectId: 7, state: '引用する' } });
  });
  it('setFlags and touch', async () => {
    const f = mockFetch({ lastOpenedAt: '2026-09-27T01:02:03Z' });
    await api.setFlags(3, { starred: true });
    expect(lastRequest(f)).toEqual({ url: '/api/entries/3/flags', method: 'PATCH', body: { starred: true } });
    expect(await api.touch(3)).toEqual({ lastOpenedAt: '2026-09-27T01:02:03Z' });
    expect(lastRequest(f)).toEqual({ url: '/api/entries/3/touch', method: 'POST', body: undefined });
  });
  it('bulk and merge post to their routes and return AppData', async () => {
    const data = appData([]);
    const f = mockFetch(data);
    expect(await api.bulk([1, 2], { type: 'read', state: '未読' })).toEqual(data);
    expect(lastRequest(f)).toEqual({ url: '/api/entries/bulk', method: 'POST', body: { ids: [1, 2], op: { type: 'read', state: '未読' } } });
    expect(await api.merge(1, [2, 3])).toEqual(data);
    expect(lastRequest(f)).toEqual({ url: '/api/entries/merge', method: 'POST', body: { keepId: 1, removeIds: [2, 3] } });
  });
  it('projects and filters use id paths', async () => {
    const f = mockFetch({ id: 9 });
    expect(await api.addProject('論文A')).toEqual({ id: 9 });
    await api.updateProject(9, { archived: true });
    expect(lastRequest(f)).toEqual({ url: '/api/projects/9', method: 'PATCH', body: { archived: true } });
    await api.reorderProjects([9, 2]);
    expect(lastRequest(f)).toEqual({ url: '/api/projects/order', method: 'PUT', body: { ids: [9, 2] } });
    await api.reorderColumn(9, '引用する', [4, 5]);
    expect(lastRequest(f)).toEqual({ url: '/api/projects/9/order', method: 'PUT', body: { state: '引用する', entryIds: [4, 5] } });
    await api.updateProjectEntry(9, 4, { memo: 'm' });
    expect(lastRequest(f)).toEqual({ url: '/api/projects/9/entries/4', method: 'PATCH', body: { memo: 'm' } });
    await api.deleteProject(9);
    expect(lastRequest(f)).toEqual({ url: '/api/projects/9', method: 'DELETE', body: undefined });
    expect(await api.addFilter('未読', { read: ['未読'] })).toEqual({ id: 9 });
    expect(lastRequest(f)).toEqual({ url: '/api/filters', method: 'POST', body: { name: '未読', query: { read: ['未読'] } } });
    await api.updateFilter(2, { name: 'x' });
    expect(lastRequest(f)).toEqual({ url: '/api/filters/2', method: 'PATCH', body: { name: 'x' } });
    await api.reorderFilters([2, 1]);
    expect(lastRequest(f)).toEqual({ url: '/api/filters/order', method: 'PUT', body: { ids: [2, 1] } });
    await api.deleteFilter(2);
    expect(lastRequest(f)).toEqual({ url: '/api/filters/2', method: 'DELETE', body: undefined });
  });
  it('duplicates unwraps groups', async () => {
    mockFetch({ groups: [{ kind: 'doi', key: '10.1/x', ids: [1, 2] }] });
    expect(await api.duplicates()).toEqual([{ kind: 'doi', key: '10.1/x', ids: [1, 2] }]);
  });
  it('bibtex posts ids', async () => {
    const f = mockFetch({ bibtex: '@article{}' });
    expect(await api.bibtex([1])).toEqual({ bibtex: '@article{}' });
    expect(lastRequest(f)).toEqual({ url: '/api/bibtex', method: 'POST', body: { ids: [1] } });
  });
  it('export URL and limits', () => {
    expect(api.exportUrl('csv')).toBe('/api/export?format=csv');
    expect(BIBTEX_LIMIT).toBe(45);
    expect(BIBTEX_LIMIT_MESSAGE).toBe('BibTeX は 1 回 45 件までです。選択を分けてください。');
    expect(BULK_LIMIT_MESSAGE).toBe('一度に扱えるのは 200 件までです。');
  });
});
