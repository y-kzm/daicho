import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AppData, Entry, OpenAccess } from '../../src/shared/types';
import { createHttp } from '../../src/worker/services/http';
import { lookupOpenAccess, normalizeDoi, toOpenAccess } from '../../src/worker/services/open-access';
import { mockFetch } from './fetch-mock';
import { seedEntry } from './helpers';
import { call, type ErrorBody } from './request';

const http = createHttp({});
const TODAY = '2026-10-01';

const work = (doi: string, status: string, extra: Record<string, unknown> = {}) => ({
  doi: `https://doi.org/${doi}`,
  open_access: { is_oa: status !== 'closed', oa_status: status, oa_url: status === 'closed' ? null : `https://example.org/${doi}.pdf` },
  best_oa_location: status === 'closed' ? null : { license: status === 'green' ? null : 'cc-by', pdf_url: `https://example.org/${doi}.pdf` },
  ...extra,
});

async function entryOf(id: number): Promise<Entry | undefined> {
  return (await call<AppData>('GET', '/api/data')).json.entries.find((e) => e.id === id);
}

describe('normalizeDoi / toOpenAccess', () => {
  it('compares DOIs in one form', () => {
    expect(normalizeDoi(' https://doi.org/10.1145/ABC ')).toBe('10.1145/abc');
    expect(normalizeDoi('doi:10.1234/x')).toBe('10.1234/x');
    expect(normalizeDoi('http://dx.doi.org/10.1234/X')).toBe('10.1234/x');
    expect(normalizeDoi('https://www.doi.org/10.1038/nature14539')).toBe('10.1038/nature14539');
    expect(normalizeDoi('doi.org/10.1038/nature14539')).toBe('10.1038/nature14539');
    expect(normalizeDoi('DOI 10.1038/Nature14539')).toBe('10.1038/nature14539');
    expect(normalizeDoi('https://doi.org/10.1002%2Fabc')).toBe('10.1002/abc');
    expect(normalizeDoi('10.1002/(SICI)1097-4571<3::AID>3.0.CO;2-0')).toBe('10.1002/(sici)1097-4571<3::aid>3.0.co;2-0');
    expect(normalizeDoi('100%')).toBe('');
    expect(normalizeDoi('https://doi.org/')).toBe('');
  });
  it('maps the OpenAlex fields', () => {
    expect(toOpenAccess(work('10.1234/a', 'gold'), TODAY)).toEqual({ status: 'gold', url: 'https://example.org/10.1234/a.pdf', license: 'cc-by', checkedAt: TODAY });
    expect(toOpenAccess(work('10.1234/a', 'green'), TODAY)).toMatchObject({ status: 'green', license: '' });
    expect(toOpenAccess(work('10.1234/a', 'closed'), TODAY)).toEqual({ status: 'closed', url: '', license: '', checkedAt: TODAY });
    expect(toOpenAccess(work('10.1234/a', 'platinum'), TODAY).status).toBe('unknown');
    expect(toOpenAccess({ open_access: { oa_status: 'gold', oa_url: 'javascript:alert(1)' } }, TODAY)).toMatchObject({ status: 'gold', url: '' });
  });
});

/** DOI ごとの応答を返す (1 件ずつの問い合わせ) */
const one = (doi: string, status: string) => ({ match: `works/doi:${encodeURIComponent(doi)}?`, body: work(doi, status) });

describe('lookupOpenAccess', () => {
  it('asks once per DOI and marks the missing ones unknown', async () => {
    const calls = mockFetch([one('10.1234/a', 'gold'), one('10.1234/b', 'closed')]);
    const r = await lookupOpenAccess(http, ['10.1234/A', 'https://doi.org/10.1234/b', '10.1234/missing', '10.1234/a'], TODAY);
    expect(calls.map((u) => u.replace(/\?.*/, ''))).toEqual([
      'https://api.openalex.org/works/doi:10.1234%2Fa', 'https://api.openalex.org/works/doi:10.1234%2Fb', 'https://api.openalex.org/works/doi:10.1234%2Fmissing',
    ]);
    expect(calls.every((u) => !u.includes('filter='))).toBe(true);
    expect([...r].map(([d, oa]) => [d, oa.status]).sort()).toEqual([['10.1234/a', 'gold'], ['10.1234/b', 'closed'], ['10.1234/missing', 'unknown']]);
  });
  it('treats an arXiv DOI that OpenAlex lacks as a preprint anyone can read', async () => {
    mockFetch([]);
    const r = await lookupOpenAccess(http, ['10.48550/arXiv.1706.03762', '10.1234/none'], TODAY);
    expect(r.get('10.48550/arxiv.1706.03762')).toEqual({ status: 'green', url: 'https://arxiv.org/abs/1706.03762', license: '', checkedAt: TODAY });
    expect(r.get('10.1234/none')!.status).toBe('unknown');
  });
  it('encodes DOIs with separators and special characters', async () => {
    const calls = mockFetch([one('10.1234/a|b', 'hybrid')]);
    expect((await lookupOpenAccess(http, ['10.1234/a|b'], TODAY)).get('10.1234/a|b')?.status).toBe('hybrid');
    expect(calls[0]).toContain('works/doi:10.1234%2Fa%7Cb?');
  });
  it('leaves out DOIs that failed, and fails only when all of them failed', async () => {
    mockFetch([one('10.1234/a', 'gold'), { match: 'works/doi:10.1234%2Fb?', status: 429, body: '' }]);
    const r = await lookupOpenAccess(http, ['10.1234/a', '10.1234/b'], TODAY);
    expect([...r.keys()]).toEqual(['10.1234/a']);
    mockFetch([{ match: 'api.openalex.org', status: 429, body: '' }]);
    await expect(lookupOpenAccess(http, ['10.1234/a', '10.1234/b'], TODAY)).rejects.toThrow(/OpenAlex から取得できません/);
    await expect(lookupOpenAccess(http, Array.from({ length: 41 }, (_, i) => `10.1234/${i}`), TODAY)).rejects.toThrow(/40 件まで/);
  });
});

describe('Open Access routes', () => {
  it('checks every unchecked paper with a DOI in batches, skipping documents and papers without DOI', async () => {
    const paper = await seedEntry(env.DB, { title: 'P', doi: '10.1234/a' });
    const closed = await seedEntry(env.DB, { title: 'C', doi: '10.1234/b' });
    const noDoi = await seedEntry(env.DB, { title: 'N' });
    const rfc = await seedEntry(env.DB, { title: 'RFC 9999', doi: '10.17487/RFC9999', kind: 'rfc' });
    mockFetch([one('10.1234/a', 'gold'), one('10.1234/b', 'closed')]);
    const r = await call<AppData & { checked: number; remaining: number } & ErrorBody>('POST', '/api/entries/oa/check');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ checked: 2, remaining: 0 });
    const byId = new Map(r.json.entries.map((e) => [e.id, e.oa]));
    expect(byId.get(paper)).toMatchObject({ status: 'gold', license: 'cc-by' });
    expect(byId.get(paper)!.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(byId.get(closed)).toMatchObject({ status: 'closed', url: '' });
    expect(byId.get(noDoi)).toEqual<OpenAccess>({ status: '', url: '', license: '', checkedAt: '' });
    expect(byId.get(rfc)!.status).toBe('');
    // 判定済みのものは、もう一度は問い合わせない
    const calls = mockFetch([]);
    expect((await call<{ checked: number }>('POST', '/api/entries/oa/check')).json.checked).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('saves what it could and leaves the failed ones for the next run', async () => {
    const a = await seedEntry(env.DB, { title: 'A', doi: '10.1234/a' });
    const b = await seedEntry(env.DB, { title: 'B', doi: '10.1234/b' });
    mockFetch([one('10.1234/a', 'gold'), { match: 'works/doi:10.1234%2Fb?', status: 429, body: '' }]);
    const r = await call<{ checked: number; failed: number; remaining: number }>('POST', '/api/entries/oa/check');
    expect(r.json).toMatchObject({ checked: 1, failed: 1, remaining: 1 });
    expect((await entryOf(a))!.oa.status).toBe('gold');
    expect((await entryOf(b))!.oa.checkedAt).toBe('');
  });

  it('keeps nothing when OpenAlex fails', async () => {
    const id = await seedEntry(env.DB, { title: 'P', doi: '10.1234/a' });
    mockFetch([{ match: 'api.openalex.org', status: 503, body: '' }]);
    expect((await call('POST', '/api/entries/oa/check')).status).toBe(502);
    expect((await entryOf(id))!.oa.checkedAt).toBe('');
  });

  it('rechecks one paper', async () => {
    const id = await seedEntry(env.DB, { title: 'P', doi: '10.1234/a' });
    mockFetch([one('10.1234/a', 'green')]);
    const r = await call<{ oa: OpenAccess }>('POST', `/api/entries/${id}/oa`);
    expect(r.json.oa).toMatchObject({ status: 'green', url: 'https://example.org/10.1234/a.pdf' });
    expect((await entryOf(id))!.oa.status).toBe('green');
    const noDoi = await seedEntry(env.DB, { title: 'N' });
    expect((await call<ErrorBody>('POST', `/api/entries/${noDoi}/oa`)).json.error).toContain('DOI が無い');
    expect((await call('POST', '/api/entries/999/oa')).status).toBe(404);
  });

  it('lets the user set the status by hand and checks the values', async () => {
    const id = await seedEntry(env.DB, { title: 'N' });
    const r = await call<{ oa: OpenAccess }>('PUT', `/api/entries/${id}/oa`, { status: 'green', url: 'https://arxiv.org/abs/2301.00001' });
    expect(r.json.oa).toMatchObject({ status: 'green', url: 'https://arxiv.org/abs/2301.00001' });
    expect((await call<{ oa: OpenAccess }>('PUT', `/api/entries/${id}/oa`, { status: 'closed', url: 'https://x.example/' })).json.oa.url).toBe('');
    for (const bad of [{ status: 'open' }, { status: 'gold', url: 'javascript:alert(1)' }, { status: 'gold', url: 'ftp://x/' }]) {
      expect((await call('PUT', `/api/entries/${id}/oa`, bad)).status).toBe(400);
    }
    expect((await call<{ oa: OpenAccess }>('PUT', `/api/entries/${id}/oa`, { status: '' })).json.oa).toEqual({ status: '', url: '', license: '', checkedAt: '' });
    // 編集フォームの保存では、判定結果は変わらない
    await call('PUT', `/api/entries/${id}/oa`, { status: 'gold', url: '' });
    const e = (await entryOf(id))!;
    await call('PUT', `/api/entries/${id}`, { ...e, title: 'N2' });
    expect((await entryOf(id))!.oa.status).toBe('gold');
  });

  it('forgets the result when the DOI or the kind changes, so that the batch checks it again', async () => {
    const id = await seedEntry(env.DB, { title: 'P', doi: '10.1234/a' });
    await call('PUT', `/api/entries/${id}/oa`, { status: 'gold', url: '' });
    const e = (await entryOf(id))!;
    await call('PUT', `/api/entries/${id}`, { ...e, note: 'memo' });
    expect((await entryOf(id))!.oa.status).toBe('gold');
    await call('PUT', `/api/entries/${id}`, { ...e, doi: '10.1234/b' });
    expect((await entryOf(id))!.oa).toEqual({ status: '', url: '', license: '', checkedAt: '' });
    await call('PUT', `/api/entries/${id}/oa`, { status: 'gold', url: '' });
    await call('PUT', `/api/entries/${id}`, { ...e, doi: '10.1234/b', kind: 'whitepaper' });
    expect((await entryOf(id))!.oa.status).toBe('');
  });

  it('refuses to check a DOI it cannot read', async () => {
    const id = await seedEntry(env.DB, { title: 'P', doi: 'https://doi.org/' });
    const r = await call<ErrorBody>('POST', `/api/entries/${id}/oa`);
    expect(r.status).toBe(400);
    expect(r.json.error).toContain('DOI の形');
  });

  it('saves the Open Access filter', async () => {
    const r = await call<{ id: number } & ErrorBody>('POST', '/api/filters', { name: 'OA', query: { oa: true } });
    expect(r.status).toBe(200);
    expect((await call<ErrorBody>('POST', '/api/filters', { name: 'bad', query: { oa: 'yes' } })).status).toBe(400);
  });
});
