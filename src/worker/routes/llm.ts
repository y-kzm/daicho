import { Hono } from 'hono';
import type { LlmInput, LlmProvider, SummaryPromptResult, SummaryResult, TagProposal } from '../../shared/types';
import { getEntriesByIds } from '../db/entries';
import { listTags } from '../db/tags';
import type { Env } from '../env';
import { AppError } from '../errors';
import { resolveAbstract } from '../services/abstract';
import { llmGenerate, parseJsonLoose, providerLabel } from '../services/llm/index';
import { buildBatchTagPrompt, buildSummaryPrompt, buildTagPrompt, sanitizeSummary } from '../services/llm/prompts';
import { assertBulkSize, idList, str } from '../validate';
import { httpFor, jsonBody } from './context';

const llm = new Hono<{ Bindings: Env }>();

function parseLlmInput(body: Record<string, unknown>): LlmInput & { title: string; provider: LlmProvider } {
  const title = str(body.title);
  if (!title) throw new AppError('先にタイトルを入力してください。');
  const provider: LlmProvider = str(body.provider) === 'claude' ? 'claude' : 'gemini';
  return { title, doi: str(body.doi), url: str(body.url), summary: str(body.summary), provider };
}

async function requireTags(db: D1Database): Promise<string[]> {
  const tags = await listTags(db);
  if (!tags.length) throw new AppError('タグが未登録です。先にタグを作成してください。');
  return tags;
}

llm.post('/prompt', async (c) => {
  const input = parseLlmInput(await jsonBody(c));
  const got = await resolveAbstract(httpFor(c.env), input);
  const out: SummaryPromptResult = { prompt: buildSummaryPrompt(input.title, got.text), usedAbstract: !!got.text, abstractSource: got.source };
  return c.json(out);
});

llm.post('/summary', async (c) => {
  const input = parseLlmInput(await jsonBody(c));
  const http = httpFor(c.env);
  const got = await resolveAbstract(http, input);
  const raw = await llmGenerate(http, c.env, input.provider, buildSummaryPrompt(input.title, got.text));
  const out: SummaryResult = {
    summary: sanitizeSummary(raw), usedAbstract: !!got.text, abstractSource: got.source,
    prompt: '', provider: providerLabel(input.provider),
  };
  return c.json(out);
});

llm.post('/tags', async (c) => {
  const input = parseLlmInput(await jsonBody(c));
  const tags = await requireTags(c.env.DB);
  const http = httpFor(c.env);
  let context = input.summary || '';
  if (!context) context = (await resolveAbstract(http, input)).text.slice(0, 1500);
  const raw = await llmGenerate(http, c.env, input.provider, buildTagPrompt(tags, input.title, context));
  const arr = parseJsonLoose(raw, 'array');
  const picked = (Array.isArray(arr) ? arr : []).map((t) => String(t).trim()).filter((t) => tags.includes(t));
  return c.json({ tags: picked });
});

llm.post('/tags/batch', async (c) => {
  const body = await jsonBody(c);
  const ids = Array.from(new Set(idList(body.ids)));
  assertBulkSize(ids.length);
  if (!ids.length) return c.json([]);
  const tags = await requireTags(c.env.DB);
  const provider: LlmProvider = str(body.provider) === 'claude' ? 'claude' : 'gemini';
  const items = (await getEntriesByIds(c.env.DB, ids)).map((e) => ({
    id: e.id, title: e.title, current: e.tags,
    summary: e.summary.replace(/\s+/g, ' ').slice(0, 300), venue: e.journal || e.conference || '',
  }));
  if (!items.length) return c.json([]);
  const raw = await llmGenerate(httpFor(c.env), c.env, provider, buildBatchTagPrompt(tags, items));
  const obj = parseJsonLoose(raw, 'object') as Record<string, unknown>;
  const out: TagProposal[] = items.map((it) => {
    const arr = obj[String(it.id)];
    const proposed = (Array.isArray(arr) ? arr : []).map((t) => String(t).trim()).filter((t) => tags.includes(t));
    return { id: it.id, title: it.title, current: it.current, proposed };
  });
  return c.json(out);
});

export default llm;
