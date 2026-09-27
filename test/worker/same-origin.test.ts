import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/worker/index';
import { isCrossSite } from '../../src/worker/same-origin';
import { seedEntry } from './helpers';

const app = createApp();
const ORIGIN = 'https://daicho.example.test';

const req = (method: string, headers: Record<string, string>) =>
  ({ method, url: ORIGIN + '/api/entries/bulk', header: (n: string) => headers[n.toLowerCase()] });

describe('isCrossSite', () => {
  it('never blocks reads', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(isCrossSite(req(m, { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }))).toBe(false);
    }
  });
  it('follows Sec-Fetch-Site when the browser sends it', () => {
    expect(isCrossSite(req('POST', { 'sec-fetch-site': 'same-origin' }))).toBe(false);
    expect(isCrossSite(req('POST', { 'sec-fetch-site': 'none' }))).toBe(false);
    expect(isCrossSite(req('POST', { 'sec-fetch-site': 'cross-site' }))).toBe(true);
    expect(isCrossSite(req('DELETE', { 'sec-fetch-site': 'same-site' }))).toBe(true);
    // 開発時の中継 (別ポート) では Origin が違っても、ブラウザから見て同一オリジンなら通す
    expect(isCrossSite(req('POST', { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5173' }))).toBe(false);
  });
  it('falls back to Origin', () => {
    expect(isCrossSite(req('POST', { origin: ORIGIN }))).toBe(false);
    expect(isCrossSite(req('POST', { origin: 'https://evil.example' }))).toBe(true);
    expect(isCrossSite(req('POST', { origin: 'https://daicho.example.test.evil.example' }))).toBe(true);
    expect(isCrossSite(req('POST', { origin: 'null' }))).toBe(true);
    expect(isCrossSite(req('PATCH', { origin: 'not a url' }))).toBe(true);
  });
  it('lets non-browser clients through', () => {
    expect(isCrossSite(req('POST', {}))).toBe(false);
  });
});

describe('cross-site writes', () => {
  const post = (path: string, headers: Record<string, string>, body: string) =>
    app.request(ORIGIN + path, { method: 'POST', headers, body }, env);

  it('are rejected before they change anything', async () => {
    const id = await seedEntry(env.DB, { title: 'Keep me' });
    const body = JSON.stringify({ ids: [id], op: { type: 'delete' } });
    const attempts: Record<string, string>[] = [
      { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      { 'content-type': 'application/json', origin: 'https://evil.example' },
    ];
    for (const headers of attempts) {
      const res = await post('/api/entries/bulk', headers, body);
      expect(res.status).toBe(403);
    }
    expect((await post('/api/drive/disconnect', { 'sec-fetch-site': 'cross-site' }, '')).status).toBe(403);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM entries').first<{ n: number }>())!.n).toBe(1);
  });

  it('cannot deliver JSON through a plain form', async () => {
    const id = await seedEntry(env.DB, { title: 'Keep me' });
    // <form enctype="text/plain"> で送れる形。Sec-Fetch-Site を付けない古いブラウザを想定
    const res = await post('/api/entries/bulk', { 'content-type': 'text/plain' }, JSON.stringify({ ids: [id], op: { type: 'delete' } }));
    expect(res.status).toBe(400);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM entries').first<{ n: number }>())!.n).toBe(1);
  });

  it('same-origin writes and cross-site reads still work', async () => {
    const id = await seedEntry(env.DB, { title: 'A' });
    const ok = await post('/api/entries/bulk', { 'content-type': 'application/json; charset=utf-8', 'sec-fetch-site': 'same-origin', origin: ORIGIN },
      JSON.stringify({ ids: [id], op: { type: 'read', state: '精読済' } }));
    expect(ok.status).toBe(200);
    const read = await app.request(ORIGIN + '/api/health', { headers: { 'sec-fetch-site': 'cross-site' } }, env);
    expect(read.status).toBe(200);
  });
});
