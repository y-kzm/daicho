import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppData, TagProposal } from '../../src/shared/types';
import type { Env } from '../../src/worker/env';
import { createApp } from '../../src/worker/index';
import { createHttp } from '../../src/worker/services/http';
import { mockFetch } from './fetch-mock';
import { seedEntry } from './helpers';

// LLM ルートの retry/backoff で待機しないよう、テストでは httpFor の sleep を無効化する。
vi.mock('../../src/worker/routes/context', async (orig) => {
  const m = await orig<typeof import('../../src/worker/routes/context')>();
  return { ...m, httpFor: (env: Env) => createHttp({ mailto: env.CONTACT_MAILTO, sleep: async () => {} }) };
});

const app = createApp();
afterEach(() => vi.unstubAllGlobals());
// GEMINI_API_KEY / ANTHROPIC_API_KEY は vitest.config.ts の miniflare.bindings でテスト用の値が入っている

async function post<T>(path: string, body: unknown): Promise<{ status: number; json: T }> {
  const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, env);
  return { status: res.status, json: (await res.json()) as T };
}

describe('metadata routes', () => {
  it('POST /api/metadata/doi', async () => {
    mockFetch([{ match: 'api.crossref.org/works/', body: { message: { type: 'journal-article', title: ['T'], 'container-title': ['J'], author: [{ family: 'Kim' }], issued: { 'date-parts': [[2024]] } } } }]);
    const r = await post<{ title: string; bibkeySuggestion: string }>('/api/metadata/doi', { input: '10.1000/x' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ title: 'T', bibkeySuggestion: 'kim2024' });
    expect((await post<{ error: string }>('/api/metadata/doi', { input: '' })).status).toBe(400);
  });
  it('POST /api/metadata/core', async () => {
    mockFetch([{ match: 'do=Export', body: '1,"ACM Internet Measurement Conference",IMC,CORE2023,A,yes\n' }]);
    const r = await post<{ candidates: { rank: string }[] }>('/api/metadata/core', { query: 'IMC' });
    expect(r.json.candidates[0]!.rank).toBe('A');
  });
});

describe('llm routes', () => {
  it('POST /api/llm/prompt returns prompt with abstract info', async () => {
    mockFetch([{ match: 'api.crossref.org/works/', body: { message: { abstract: 'An abstract' } } }]);
    const r = await post<{ prompt: string; usedAbstract: boolean; abstractSource: string }>('/api/llm/prompt', { title: 'T', doi: '10.1000/x' });
    expect(r.json.usedAbstract).toBe(true);
    expect(r.json.abstractSource).toBe('Crossref');
    expect(r.json.prompt).toContain('タイトル: T');
    expect((await post<{ error: string }>('/api/llm/prompt', { title: '' })).json.error).toBe('先にタイトルを入力してください。');
  });

  it('POST /api/llm/summary sanitizes output', async () => {
    mockFetch([
      { match: 'api.crossref.org', status: 404, body: '' },
      { match: /api\.(datacite|semanticscholar|openalex)/, status: 404, body: '' },
      { match: 'doi.org/', status: 404, body: '' },
      { match: 'anthropic', body: { content: [{ type: 'text', text: '**提案手法はどのようなものか？**\nX' }] } },
    ]);
    const r = await post<{ summary: string; provider: string; usedAbstract: boolean }>('/api/llm/summary', { title: 'T', doi: '10.1/x', provider: 'claude' });
    expect(r.json).toMatchObject({ summary: '提案手法はどのようなものか？: X', provider: 'Claude Haiku', usedAbstract: false });
  });

  it('POST /api/llm/tags keeps only known tags', async () => {
    await app.request('/api/tags', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'IPv6' }) }, env);
    mockFetch([{ match: 'generativelanguage', body: { candidates: [{ content: { parts: [{ text: '["IPv6", "Made Up"]' }] } }] } }]);
    const r = await post<{ tags: string[] }>('/api/llm/tags', { title: 'T', summary: 'S', provider: 'gemini' });
    expect(r.json.tags).toEqual(['IPv6']);
  });

  it('POST /api/llm/tags/batch + POST /api/tags/apply', async () => {
    await app.request('/api/tags', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'A' }) }, env);
    const id1 = await seedEntry(env.DB, { title: 'P1', tags: ['A'] });
    const id2 = await seedEntry(env.DB, { title: 'P2' });
    mockFetch([{ match: 'generativelanguage', body: { candidates: [{ content: { parts: [{ text: `{"${id1}": [], "${id2}": ["A"]}` }] } }] } }]);
    const r = await post<TagProposal[]>('/api/llm/tags/batch', { ids: [id1, id2], provider: 'gemini' });
    expect(r.json).toEqual([
      { id: id1, title: 'P1', current: ['A'], proposed: [] },
      { id: id2, title: 'P2', current: [], proposed: ['A'] },
    ]);
    const applied = await post<AppData>('/api/tags/apply', { proposals: [{ id: id2, tags: ['A'] }] });
    expect(applied.json.entries.find((e) => e.id === id2)!.tags).toEqual(['A']);
    expect((await post<{ error: string }>('/api/tags/apply', { proposals: [] })).json.error).toBe('適用対象がありません。');
  });

  it('POST /api/llm/tags/batch rejects more than BULK_MAX ids before calling the LLM', async () => {
    await app.request('/api/tags', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'A' }) }, env);
    const calls = mockFetch([{ match: /.*/, body: {} }]);
    const ids = Array.from({ length: 201 }, (_, i) => i + 1);
    const r = await post<{ error: string }>('/api/llm/tags/batch', { ids, provider: 'gemini' });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('一度に扱えるのは 200 件までです。');
    expect(calls).toEqual([]);
  });

  it('POST /api/tags/apply does not create a tag for a non-existent entry id', async () => {
    await seedEntry(env.DB, { title: 'Only' });
    const applied = await post<AppData>('/api/tags/apply', { proposals: [{ id: 999, tags: ['Ghost'] }] });
    expect(applied.status).toBe(200);
    expect(applied.json.tags).not.toContain('Ghost');
  });

  it('errors when no tags exist', async () => {
    const r = await post<{ error: string }>('/api/llm/tags', { title: 'T' });
    expect(r.json.error).toBe('タグが未登録です。先にタグを作成してください。');
  });
});

describe('POST /api/bibtex', () => {
  it('exports selected ids or all', async () => {
    const a = await seedEntry(env.DB, { title: 'A', bibkey: 'a1', journal: 'J' });
    await seedEntry(env.DB, { title: 'B', bibkey: 'b1' });
    const sel = await post<{ bibtex: string }>('/api/bibtex', { ids: [a] });
    expect(sel.json.bibtex).toContain('@article{a1,');
    expect(sel.json.bibtex).not.toContain('b1');
    const all = await post<{ bibtex: string }>('/api/bibtex', { ids: null });
    expect(all.json.bibtex).toContain('@misc{b1,');
    expect((await post<{ error: string }>('/api/bibtex', { ids: [999] })).json.error).toBe('対象のエントリがありません。');
  });
});
