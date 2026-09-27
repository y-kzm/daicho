import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/worker/env';
import { createHttp } from '../../src/worker/services/http';
import { claudeGenerate } from '../../src/worker/services/llm/claude';
import { geminiGenerate } from '../../src/worker/services/llm/gemini';
import { llmGenerate, parseJsonLoose, providerLabel } from '../../src/worker/services/llm/index';
import { buildBatchTagPrompt, buildSummaryPrompt, buildTagPrompt, sanitizeSummary } from '../../src/worker/services/llm/prompts';
import { mockFetch } from './fetch-mock';

const http = createHttp({ sleep: async () => {} });
afterEach(() => vi.unstubAllGlobals());

describe('prompts', () => {
  it('buildSummaryPrompt includes title and abstract or the fallback instruction', () => {
    expect(buildSummaryPrompt('T', 'ABS')).toContain('アブストラクト: ABS');
    expect(buildSummaryPrompt('T', '')).toContain('(取得できませんでした)');
  });
  it('sanitizeSummary strips markdown and joins question/answer lines', () => {
    expect(sanitizeSummary('```\n**提案手法はどのようなものか？**\n回答A\n- 先行研究と比べてすごいことは？: 回答B\n```'))
      .toBe('提案手法はどのようなものか？: 回答A\n先行研究と比べてすごいことは？: 回答B');
  });
  it('buildTagPrompt includes the tag list and context, or the no-context fallback', () => {
    const withContext = buildTagPrompt(['A', 'B'], 'T', 'ctx');
    expect(withContext).toContain('タグ一覧: ["A","B"]');
    expect(withContext).toContain('内容: ctx');
    expect(buildTagPrompt(['A', 'B'], 'T', '')).toContain('(内容情報なし。タイトルから判断)');
  });
  it('buildBatchTagPrompt lists each item with its venue and summary', () => {
    const prompt = buildBatchTagPrompt(['A'], [{ id: 5, title: 'P', venue: 'V', summary: 'S' }]);
    expect(prompt).toContain('[5] P (V)');
    expect(prompt).toContain('内容: S');
  });
});

describe('parseJsonLoose', () => {
  it('extracts arrays/objects from fenced text', () => {
    expect(parseJsonLoose('```json\n["a","b"]\n```', 'array')).toEqual(['a', 'b']);
    expect(parseJsonLoose('here: {"1": ["x"]} done', 'object')).toEqual({ '1': ['x'] });
    expect(() => parseJsonLoose('nope', 'array')).toThrow('AI の応答を JSON として解釈できませんでした。');
  });
});

describe('claudeGenerate', () => {
  it('requires the key and returns text', async () => {
    await expect(claudeGenerate(http, undefined, 'p')).rejects.toThrow('ANTHROPIC_API_KEY が未設定です');
    mockFetch([{ match: 'api.anthropic.com/v1/messages', body: { content: [{ type: 'text', text: ' hi ' }] } }]);
    expect(await claudeGenerate(http, 'k', 'p')).toBe('hi');
  });
  it('maps 401 and empty content to errors', async () => {
    mockFetch([{ match: 'anthropic', status: 401, body: '' }]);
    await expect(claudeGenerate(http, 'k', 'p')).rejects.toThrow('Claude API キーが無効です');
    mockFetch([{ match: 'anthropic', body: { content: [], stop_reason: 'max_tokens' } }]);
    await expect(claudeGenerate(http, 'k', 'p')).rejects.toThrow('stop_reason: max_tokens');
  });
  it('retries on 529 and succeeds on the third attempt', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++;
      if (calls < 3) return new Response('busy', { status: 529 });
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), { status: 200 });
    }));
    expect(await claudeGenerate(http, 'k', 'p')).toBe('ok');
    expect(calls).toBe(3);
  });
  it('rejects after 3 attempts of 429', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++;
      return new Response('busy', { status: 429 });
    }));
    await expect(claudeGenerate(http, 'k', 'p')).rejects.toThrow('Claude API のレート制限に達しました');
    expect(calls).toBe(3);
  });
});

describe('geminiGenerate', () => {
  it('drops thinkingConfig on 400 and retries; falls back to the second model on 503', async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: RequestInit) => {
      calls.push({ url: u, body: String(init.body) });
      if (calls.length === 1) return new Response('bad', { status: 400 });
      if (calls.length === 2) return new Response('busy', { status: 503 });
      if (calls.length === 3) return new Response('busy', { status: 503 });
      if (calls.length === 4) return new Response('busy', { status: 503 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });
    }));
    expect(await geminiGenerate(http, 'k', 'p')).toBe('ok');
    expect(calls[0]!.body).toContain('thinkingConfig');
    expect(calls[1]!.body).not.toContain('thinkingConfig');
    expect(calls[4]!.url).toContain('gemini-flash-lite-latest');
  });
  it('requires the key', async () => {
    await expect(geminiGenerate(http, '', 'p')).rejects.toThrow('GEMINI_API_KEY が未設定です');
  });
});

describe('llmGenerate', () => {
  it('routes by provider', async () => {
    mockFetch([
      { match: 'anthropic', body: { content: [{ type: 'text', text: 'claude' }] } },
      { match: 'generativelanguage', body: { candidates: [{ content: { parts: [{ text: 'gemini' }] } }] } },
    ]);
    const env = { GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' } as unknown as Env;
    expect(await llmGenerate(http, env, 'claude', 'p')).toBe('claude');
    expect(await llmGenerate(http, env, 'gemini', 'p')).toBe('gemini');
    expect(await llmGenerate(http, env, undefined, 'p')).toBe('gemini');
  });
});

describe('providerLabel', () => {
  it('labels claude and defaults to Gemini', () => {
    expect(providerLabel('claude')).toBe('Claude Haiku');
    expect(providerLabel(undefined)).toBe('Gemini');
  });
});
