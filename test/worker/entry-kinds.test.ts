import { applyD1Migrations, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AppData } from '../../src/shared/types';
import { mockFetch } from './fetch-mock';
import { seedEntry } from './helpers';
import { call, type ErrorBody } from './request';

const data = async () => (await call<AppData>('GET', '/api/data')).json;

describe('entry kinds', () => {
  it('defaults to a paper and stores the kind and status', async () => {
    mockFetch([{ match: /.*/, status: 404, body: '' }]);
    const a = await call<{ id: number }>('POST', '/api/entries', { title: 'Plain', bibkey: 'plain' });
    const b = await call<{ id: number }>('POST', '/api/entries', { title: 'WP', bibkey: 'wp', kind: 'whitepaper', docStatus: ' 公開中 ' });
    const d = await data();
    expect(d.entries.find((e) => e.id === a.json.id)).toMatchObject({ kind: 'paper', docStatus: '' });
    expect(d.entries.find((e) => e.id === b.json.id)).toMatchObject({ kind: 'whitepaper', docStatus: '公開中' });
  });

  it('keeps the kind on edit and lets it change', async () => {
    const id = await seedEntry(env.DB, { title: 'Doc', bibkey: 'doc', kind: 'draft', docStatus: '有効' });
    const e = (await data()).entries[0]!;
    const { id: _id, added: _a, cites: _c, starred: _s, priority: _p, lastOpenedAt: _l, attachments: _f, ...input } = e;
    expect((await call('PUT', `/api/entries/${id}`, { ...input, note: 'n' })).status).toBe(200);
    expect((await data()).entries[0]).toMatchObject({ kind: 'draft', docStatus: '有効', note: 'n' });
    expect((await call('PUT', `/api/entries/${id}`, { ...input, kind: 'rfc', docStatus: 'Informational' })).status).toBe(200);
    expect((await data()).entries[0]).toMatchObject({ kind: 'rfc', docStatus: 'Informational' });
  });

  it('keeps the stored kind and status when an update does not send them', async () => {
    // 更新前から開いていた画面は、種類と状態を送らない
    const id = await seedEntry(env.DB, { title: 'RFC 8200', bibkey: 'rfc8200', kind: 'rfc', docStatus: 'Internet Standard' });
    const e = (await data()).entries[0]!;
    const { id: _id, added: _a, cites: _c, starred: _s, priority: _p, lastOpenedAt: _l, attachments: _f, kind: _k, docStatus: _d, ...old } = e;
    expect((await call('PUT', `/api/entries/${id}`, { ...old, note: 'from an old tab' })).status).toBe(200);
    expect((await data()).entries[0]).toMatchObject({ kind: 'rfc', docStatus: 'Internet Standard', note: 'from an old tab' });
    expect((await call('PUT', `/api/entries/${id}`, { ...old, docStatus: '' })).status).toBe(200);
    expect((await data()).entries[0]).toMatchObject({ kind: 'rfc', docStatus: '' });
    expect((await call('PUT', '/api/entries/9999', old)).status).toBe(404);
  });

  it('rejects an unknown kind instead of storing a paper', async () => {
    mockFetch([{ match: /.*/, status: 404, body: '' }]);
    const r = await call<ErrorBody>('POST', '/api/entries', { title: 'X', bibkey: 'x', kind: 'book' });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('文献の種類が不正です。');
    expect((await data()).entries).toEqual([]);
  });

  it('cuts an overlong status', async () => {
    mockFetch([{ match: /.*/, status: 404, body: '' }]);
    await call('POST', '/api/entries', { title: 'X', bibkey: 'x', kind: 'other', docStatus: 's'.repeat(200) });
    expect((await data()).entries[0]!.docStatus).toHaveLength(80);
  });

  it('keeps the kind of the kept entry on merge and fills an empty status', async () => {
    const keep = await seedEntry(env.DB, { title: 'RFC 8200', bibkey: 'rfc8200', kind: 'rfc' });
    const other = await seedEntry(env.DB, { title: 'RFC 8200', bibkey: 'dup', kind: 'paper', docStatus: 'Internet Standard' });
    const r = await call<AppData>('POST', '/api/entries/merge', { keepId: keep, removeIds: [other] });
    expect(r.json.entries).toHaveLength(1);
    expect(r.json.entries[0]).toMatchObject({ kind: 'rfc', docStatus: 'Internet Standard' });
  });

  it('takes the kind of the merged entry when the kept one is a paper', async () => {
    const keep = await seedEntry(env.DB, { title: 'RFC 8200', bibkey: 'paperkey', kind: 'paper' });
    const other = await seedEntry(env.DB, { title: 'RFC 8200', bibkey: 'rfc8200', kind: 'rfc', docStatus: 'Internet Standard' });
    const r = await call<AppData>('POST', '/api/entries/merge', { keepId: keep, removeIds: [other] });
    expect(r.json.entries[0]).toMatchObject({ kind: 'rfc', docStatus: 'Internet Standard' });
  });

  it('accepts kinds in a saved filter and rejects unknown ones', async () => {
    const ok = await call<{ id: number }>('POST', '/api/filters', { name: 'Std', query: { kinds: ['rfc', 'draft'] } });
    expect(ok.status).toBe(200);
    expect((await data()).savedFilters[0]!.query).toEqual({ kinds: ['rfc', 'draft'] });
    expect((await call('POST', '/api/filters', { name: 'Bad', query: { kinds: ['book'] } })).status).toBe(400);
  });
});

describe('migration 0004_entry_kinds', () => {
  it('sorts existing RFCs and drafts, and leaves papers alone', async () => {
    for (const t of ['venue_deadlines', 'venue_editions', 'venues', 'attachments', 'drive_auth', 'entry_tags', 'cites', 'saved_filters', 'settings', 'tags', 'projects', 'entries', 'd1_migrations']) {
      await env.DB.prepare(`DROP TABLE IF EXISTS ${t}`).run();
    }
    const before = env.TEST_MIGRATIONS.filter((m) => m.name < '0004');
    const last = env.TEST_MIGRATIONS.filter((m) => m.name.startsWith('0004'));
    expect(last.map((m) => m.name)).toEqual(['0004_entry_kinds.sql']);
    await applyD1Migrations(env.DB, before);
    const rows: [string, string, string, string][] = [
      ['RFC 8200: IPv6', '10.17487/RFC8200', 'rfc8200', 'RFC Editor (IETF)'],
      ['Old RFC without DOI', '', 'RFC791', ''],
      ['RFC by publisher only', '', 'postel1981', 'RFC Editor (IETF)'],
      ['draft-ietf-6man-sids-05: SIDs', '', 'draft-ietf-6man-sids', 'IETF (Internet-Draft)'],
      ['Draft by key only', '', 'draft-foo-bar', ''],
      ['draft-only-in-title-00: X', '', 'x2024', ''],
      ['A paper about RFC 8200', '10.1145/1234', 'li2022rfc', 'ACM'],
      ['Rfcomm measurements', '', 'rfcomm2020', ''],
      ['A first draft of history', '', 'smith2020draft', ''],
      ['Draft-and-Verify: Lossless LLM Acceleration', '', 'zhang2024draft', ''],
      ['Draft-then-Revise decoding', '', 'draft2024', ''],
      ['Notes on rfc8200bis', '', 'rfc8200bis-notes', ''],
      ['RFC8200-compliant stacks', '', 'rfc82002024', ''],
      ['RFC 791: Internet Protocol', '', 'postel1981a', ''],
      ['Second copy of RFC 8200', '', 'rfc8200a', ''],
    ];
    await env.DB.batch(rows.map(([title, doi, bibkey, publisher]) =>
      env.DB.prepare("INSERT INTO entries (added, title, doi, bibkey, publisher) VALUES ('2026-01-01', ?, ?, ?, ?)").bind(title, doi, bibkey, publisher)));
    await applyD1Migrations(env.DB, [...before, ...last]);
    const got = await env.DB.prepare('SELECT title, kind, doc_status FROM entries ORDER BY id').all<{ title: string; kind: string; doc_status: string }>();
    expect(got.results.map((r) => [r.title.slice(0, 24), r.kind])).toEqual([
      ['RFC 8200: IPv6', 'rfc'], ['Old RFC without DOI', 'rfc'], ['RFC by publisher only', 'rfc'],
      ['draft-ietf-6man-sids-05:', 'draft'], ['Draft by key only', 'draft'], ['draft-only-in-title-00: ', 'draft'],
      ['A paper about RFC 8200', 'paper'], ['Rfcomm measurements', 'paper'], ['A first draft of history', 'paper'],
      ['Draft-and-Verify: Lossle', 'paper'], ['Draft-then-Revise decodi', 'paper'],
      ['Notes on rfc8200bis', 'paper'], ['RFC8200-compliant stacks', 'paper'],
      ['RFC 791: Internet Protoc', 'rfc'], ['Second copy of RFC 8200', 'rfc'],
    ]);
    expect(got.results.every((r) => r.doc_status === '')).toBe(true);
  });
});
