import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackfillCountryResult, BackfillVenueResult, DuplicateGroup } from '../../src/shared/types';
import { entriesToCsv, listDuplicates } from '../../src/worker/db/maintenance';
import { getEntry, setCiteState } from '../../src/worker/db/entries';
import { getAppData, loadEntries } from '../../src/worker/db/app-data';
import { createApp } from '../../src/worker/index';
import { mockFetch } from './fetch-mock';
import { seedEntry, seedProject } from './helpers';

const app = createApp();
afterEach(() => vi.unstubAllGlobals());

describe('entriesToCsv / listDuplicates', () => {
  it('writes the 17 sheet columns, escaping quotes and formula prefixes', async () => {
    const id = await seedEntry(env.DB, { title: 'Say "hi"', tags: ['A', 'B'], note: '=1+1' }, '2026-01-01');
    const p = await seedProject(env.DB, 'P');
    await setCiteState(env.DB, id, p, '引用する');
    const csv = entriesToCsv(await loadEntries(env.DB), (await getAppData(env.DB)).projects);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('追加日,タグ,タイトル,概要,URL,DOI,年,出版国,出版社,ジャーナル,Impact Factor,カンファレンス,CORE Ranking,BibTeXキー,読了状態,メモ,引用状態');
    expect(lines[1]).toBe('2026-01-01,"A, B","Say ""hi""",,,,,,,,,,,,未読,\'=1+1,P: 引用する');
  });
  it('groups duplicates by title, doi and bibkey', async () => {
    const a = await seedEntry(env.DB, { title: 'Same', doi: '10.1/d', bibkey: 'k' });
    const b = await seedEntry(env.DB, { title: 'Same', doi: '10.1/d', bibkey: 'k2' });
    const c = await seedEntry(env.DB, { title: 'Other', bibkey: 'k' });
    const groups = listDuplicates(await loadEntries(env.DB));
    expect(groups).toEqual<DuplicateGroup[]>([
      { kind: 'title', key: 'Same', ids: [a, b] },
      { kind: 'doi', key: '10.1/d', ids: [a, b] },
      { kind: 'bibkey', key: 'k', ids: [a, c] },
    ]);
  });
});

describe('export route', () => {
  it('serves json and csv with download headers', async () => {
    await seedEntry(env.DB, { title: 'A' });
    const j = await app.request('/api/export?format=json', {}, env);
    expect(j.headers.get('content-disposition')).toContain('daicho.json');
    expect(((await j.json()) as { entries: unknown[] }).entries.length).toBe(1);
    const c = await app.request('/api/export?format=csv', {}, env);
    expect(c.headers.get('content-type')).toContain('text/csv');
    expect(c.headers.get('content-disposition')).toContain('daicho.csv');
    expect((await c.text()).startsWith('﻿追加日,')).toBe(true);
    expect((await app.request('/api/export?format=xml', {}, env)).status).toBe(400);
  });
});

describe('maintenance routes', () => {
  it('duplicates', async () => {
    await seedEntry(env.DB, { title: 'S' });
    await seedEntry(env.DB, { title: 'S' });
    const r = await app.request('/api/maintenance/duplicates', {}, env);
    expect(((await r.json()) as { groups: DuplicateGroup[] }).groups[0]!.kind).toBe('title');
  });

  it('backfill-venue-ratings fills blanks from later rows, dryRun by default', async () => {
    await seedEntry(env.DB, { title: 'A', journal: 'J', impactFactor: '3.0' });
    const b = await seedEntry(env.DB, { title: 'B', journal: 'j', impactFactor: '' });
    await seedEntry(env.DB, { title: 'C', journal: 'J', impactFactor: '4.0' });
    const dry = await app.request('/api/maintenance/backfill-venue-ratings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, env);
    const d = (await dry.json()) as BackfillVenueResult;
    expect(d).toMatchObject({ dryRun: true, filledIf: 1, filledCore: 0 });
    expect(d.log.join('\n')).toContain('値の不一致');
    expect((await getEntry(env.DB, b))!.impactFactor).toBe('');
    const wet = await app.request('/api/maintenance/backfill-venue-ratings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"dryRun":false}' }, env);
    expect(((await wet.json()) as BackfillVenueResult).dryRun).toBe(false);
    expect((await getEntry(env.DB, b))!.impactFactor).toBe('4.0');
  });

  it('backfill-countries updates via Crossref + detectCountry', async () => {
    const a = await seedEntry(env.DB, { title: 'A', doi: '10.1000/a', country: '' });
    await seedEntry(env.DB, { title: 'NoDoi' });
    mockFetch([{ match: 'api.crossref.org/works/', body: { message: { publisher: 'Springer Nature Switzerland', 'container-title': ['J'] } } }]);
    const res = await app.request('/api/maintenance/backfill-countries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"dryRun":false}' }, env);
    const r = (await res.json()) as BackfillCountryResult;
    expect(r).toMatchObject({ checked: 1, changed: 1, skipped: 1, failed: 0 });
    expect((await getEntry(env.DB, a))!.country).toBe('スイス');
  });

  it('backfill-countries pages through entries with offset/limit', async () => {
    for (let i = 1; i <= 17; i++) {
      await seedEntry(env.DB, { title: `E${i}`, doi: `10.1000/e${i}` });
    }
    mockFetch([{ match: 'api.crossref.org/works/', body: { message: { publisher: 'Springer Nature Switzerland', 'container-title': ['J'] } } }]);
    const page1 = await app.request('/api/maintenance/backfill-countries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"dryRun":true}' }, env);
    const r1 = (await page1.json()) as BackfillCountryResult;
    expect(r1).toMatchObject({ checked: 15, nextOffset: 15 });
    const page2 = await app.request('/api/maintenance/backfill-countries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"dryRun":true,"offset":15}' }, env);
    const r2 = (await page2.json()) as BackfillCountryResult;
    expect(r2).toMatchObject({ checked: 2, nextOffset: null });
  });
});
