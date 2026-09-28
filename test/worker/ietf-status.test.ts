import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AppData, IetfStatus } from '../../src/shared/types';
import { draftStatus, ietfRefOf, rfcNumberOf, rfcStatus } from '../../src/worker/services/ietf-status';
import { mockFetch } from './fetch-mock';
import { seedEntry } from './helpers';
import { call, type ErrorBody } from './request';

const base = { kind: 'paper' as const, doi: '', bibkey: '', title: '', url: '' };

describe('ietfRefOf', () => {
  it('finds an RFC by DOI, BibTeX key or title', () => {
    expect(ietfRefOf({ ...base, doi: '10.17487/RFC8200' })).toEqual({ kind: 'rfc', number: 8200 });
    expect(ietfRefOf({ ...base, bibkey: 'rfc4861' })).toEqual({ kind: 'rfc', number: 4861 });
    expect(ietfRefOf({ ...base, title: 'RFC 791: Internet Protocol' })).toEqual({ kind: 'rfc', number: 791 });
  });
  it('finds a draft and takes the revision from the title or the URL', () => {
    expect(ietfRefOf({ ...base, bibkey: 'draft-ietf-6man-sids', title: 'draft-ietf-6man-sids-05: SRv6 SIDs' }))
      .toEqual({ kind: 'draft', name: 'draft-ietf-6man-sids', rev: '05' });
    expect(ietfRefOf({ ...base, bibkey: 'draft-ietf-6man-sids', title: 'SRv6 SIDs' }))
      .toEqual({ kind: 'draft', name: 'draft-ietf-6man-sids', rev: '' });
    expect(ietfRefOf({ ...base, title: 'Notes', url: 'https://datatracker.ietf.org/doc/draft-foo-bar-02/' }))
      .toEqual({ kind: 'draft', name: 'draft-foo-bar', rev: '02' });
  });
  it('does not mistake a name ending in digits for a revision', () => {
    expect(ietfRefOf({ ...base, title: 'draft-ietf-v6ops-rfc7084bis: Requirements' }))
      .toEqual({ kind: 'draft', name: 'draft-ietf-v6ops-rfc7084bis', rev: '' });
    expect(ietfRefOf({ ...base, title: 'draft-ietf-6man-rfc2460bis-13: IPv6' }))
      .toEqual({ kind: 'draft', name: 'draft-ietf-6man-rfc2460bis', rev: '13' });
  });
  it('survives the letter that makes a BibTeX key unique, and a key that includes the revision', () => {
    expect(ietfRefOf({ ...base, bibkey: 'draft-ietf-fooa', title: 'draft-ietf-foo-07: Foo' })).toEqual({ kind: 'draft', name: 'draft-ietf-foo', rev: '07' });
    expect(ietfRefOf({ ...base, bibkey: 'draft-foo-bar-05', title: 'Foo' })).toEqual({ kind: 'draft', name: 'draft-foo-bar', rev: '05' });
    expect(ietfRefOf({ ...base, bibkey: 'rfc8200a', title: 'IPv6' })).toEqual({ kind: 'rfc', number: 8200 });
    expect(ietfRefOf({ ...base, bibkey: 'rfc8200bis', title: 'IPv6' })).toBeNull();
  });

  it('looks only for the kind the entry is marked as', () => {
    expect(ietfRefOf({ ...base, kind: 'rfc', title: 'Notes', url: 'https://datatracker.ietf.org/doc/draft-foo-bar-02/' })).toBeNull();
    expect(ietfRefOf({ ...base, kind: 'draft', doi: '10.17487/rfc8200', title: 'IPv6' })).toBeNull();
  });

  it('prefers the draft when the entry is marked as a draft', () => {
    const e = { ...base, kind: 'draft' as const, title: 'draft-ietf-6man-rfc2460bis-13: IPv6', doi: '10.17487/rfc8200' };
    expect(ietfRefOf(e)).toEqual({ kind: 'draft', name: 'draft-ietf-6man-rfc2460bis', rev: '13' });
  });
  it('returns null for ordinary papers', () => {
    expect(ietfRefOf({ ...base, doi: '10.1145/3517745.3563019', bibkey: 'li2022', title: 'A draft of history' })).toBeNull();
    expect(ietfRefOf({ ...base, title: 'Rfcomm in practice' })).toBeNull();
  });
});

describe('draftStatus / rfcStatus', () => {
  const doc = { name: 'draft-ietf-6man-sids', rev: '06', expires: '2027-03-01 00:00:00' };
  it('reports an active draft and a newer revision', () => {
    expect(draftStatus({ ...doc, state: 'Active' }, '06')).toEqual({
      docStatus: '有効', newerDraft: undefined, message: '有効な Internet-Draft です (2027-03-01 に失効)。',
    });
    const s = draftStatus({ ...doc, state: 'Active' }, '04');
    expect(s.newerDraft).toBe('draft-ietf-6man-sids-06');
    expect(s.message).toContain('新しい版 -06 があります (登録は -04)');
  });
  it('does not claim a newer revision when the stored one is unknown or newer', () => {
    expect(draftStatus({ ...doc, state: 'Active' }, '').newerDraft).toBeUndefined();
    expect(draftStatus({ ...doc, state: 'Active' }, '07').newerDraft).toBeUndefined();
  });
  it('reports expired and replaced drafts', () => {
    expect(draftStatus({ ...doc, state: 'Expired', expires: '2024-08-18 14:33:01' }, '06').docStatus).toBe('失効');
    expect(draftStatus({ ...doc, state: 'Replaced' }, '06').docStatus).toBe('置き換え済み');
    expect(draftStatus({ ...doc, state: 'Something new' }, '06').docStatus).toBe('Something new');
    expect(draftStatus({ ...doc, state: null }, '06').docStatus).toBe('不明');
  });
  it('finds the RFC a draft became', () => {
    const d = { ...doc, state: 'RFC', rev_history: [{ name: 'draft-ietf-6man-sids', rev: '06' }, { name: 'rfc9602', rev: 'rfc9602' }] };
    expect(rfcNumberOf(d)).toBe(9602);
    expect(draftStatus(d, '06')).toMatchObject({ docStatus: 'RFC 9602 として発行済み', rfcNumber: 9602 });
    expect(draftStatus({ ...doc, state: 'RFC' }, '06')).toMatchObject({ docStatus: 'RFC として発行済み', rfcNumber: undefined });
    expect(rfcNumberOf({ rev_history: [{ name: 'draft-rfc1234-notes', rev: '00' }] })).toBeUndefined();
  });
  it('uses the standards level for RFCs', () => {
    expect(rfcStatus({ std_level: 'Internet Standard' })).toBe('Internet Standard');
    expect(rfcStatus({ std_level: null })).toBe('発行済み');
  });
});

describe('POST /api/metadata/ietf-status', () => {
  const check = (entryId: unknown) => call<IetfStatus & ErrorBody>('POST', '/api/metadata/ietf-status', { entryId });

  it('stores the status of an RFC', async () => {
    const id = await seedEntry(env.DB, { title: 'RFC 8200: IPv6', doi: '10.17487/rfc8200', bibkey: 'rfc8200', kind: 'rfc' });
    const calls = mockFetch([{ match: '/doc/rfc8200/doc.json', body: { name: 'rfc8200', title: 'IPv6', state: 'Published', std_level: 'Internet Standard' } }]);
    const r = await check(id);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ docStatus: 'Internet Standard', message: 'RFC 8200: Internet Standard' });
    expect(calls).toHaveLength(1);
    expect((await call<AppData>('GET', '/api/data')).json.entries[0]!.docStatus).toBe('Internet Standard');
  });

  it('reports a draft that became an RFC without changing the kind', async () => {
    const id = await seedEntry(env.DB, { title: 'draft-ietf-6man-sids-05: SIDs', bibkey: 'draft-ietf-6man-sids', kind: 'draft' });
    mockFetch([{ match: '/doc/draft-ietf-6man-sids/doc.json', body: {
      name: 'draft-ietf-6man-sids', title: 'SIDs', rev: '06', state: 'RFC', rev_history: [{ name: 'rfc9602', rev: 'rfc9602' }],
    } }]);
    const r = await check(id);
    expect(r.json).toMatchObject({ docStatus: 'RFC 9602 として発行済み', rfcNumber: 9602 });
    const e = (await call<AppData>('GET', '/api/data')).json.entries[0]!;
    expect([e.kind, e.docStatus, e.title]).toEqual(['draft', 'RFC 9602 として発行済み', 'draft-ietf-6man-sids-05: SIDs']);
  });

  it('refuses other kinds, even when their URL names a draft', async () => {
    const calls = mockFetch([{ match: /.*/, body: { name: 'draft-x-y', title: 'T', state: 'Active' } }]);
    for (const kind of ['paper', 'whitepaper', 'other'] as const) {
      const id = await seedEntry(env.DB, { title: 'Doc ' + kind, bibkey: 'k' + kind, url: 'https://example.org/draft-x-y-01', kind });
      const r = await check(id);
      expect(r.status, kind).toBe(400);
      expect(r.json.error).toContain('RFC または Internet-Draft');
    }
    expect(calls).toHaveLength(0);
    expect((await call<AppData>('GET', '/api/data')).json.entries.every((e) => e.docStatus === '')).toBe(true);
  });

  it('cuts an overlong status from the service', async () => {
    const id = await seedEntry(env.DB, { title: 'RFC 1: X', bibkey: 'rfc1', kind: 'rfc' });
    mockFetch([{ match: '/doc/rfc1/doc.json', body: { name: 'rfc1', title: 'X', std_level: 'L'.repeat(300) } }]);
    const r = await check(id);
    expect(r.json.docStatus).toHaveLength(80);
    expect((await call<AppData>('GET', '/api/data')).json.entries[0]!.docStatus).toHaveLength(80);
  });

  it('explains when the document cannot be identified or found', async () => {
    const unnamed = await seedEntry(env.DB, { title: 'A standard', bibkey: 'li2022', kind: 'rfc' });
    const calls = mockFetch([{ match: /.*/, status: 404, body: '' }]);
    const none = await check(unnamed);
    expect(none.status).toBe(400);
    expect(none.json.error).toContain('特定できません');
    expect(calls).toHaveLength(0);
    const gone = await seedEntry(env.DB, { title: 'RFC 99999', bibkey: 'rfc99999', kind: 'rfc' });
    expect((await check(gone)).status).toBe(404);
    expect((await check(9999)).status).toBe(404);
    expect((await check('x')).status).toBe(400);
  });
});
