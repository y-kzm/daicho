import { Hono } from 'hono';
import { getAppData } from '../db/app-data';
import { applyMerge } from '../db/merge';
import {
  bulkApply, deleteEntry, ensureUniqueBibkey, insertEntry, setCiteState, setFlags, setReadState, touchEntry, updateEntry,
} from '../db/entries';
import { todayJst } from '../date';
import type { Env } from '../env';
import { AppError } from '../errors';
import { generateBibkey } from '../services/bibtex';
import {
  idList, optBool, optPriority, parseBulkOp, parseEntryInput, parseEntryProjects, parseIdParam, positiveInt, str,
} from '../validate';
import { httpFor, jsonBody } from './context';

const entries = new Hono<{ Bindings: Env }>();

// 静的パスは /:id より前に登録する
entries.post('/bulk', async (c) => {
  const body = await jsonBody(c);
  if (!Array.isArray(body.ids)) throw new AppError('リクエスト本文が不正です。');
  await bulkApply(c.env.DB, idList(body.ids), parseBulkOp(body.op));
  return c.json(await getAppData(c.env.DB));
});

entries.post('/merge', async (c) => {
  const body = await jsonBody(c);
  if (!Array.isArray(body.removeIds)) throw new AppError('リクエスト本文が不正です。');
  await applyMerge(c.env.DB, positiveInt(body.keepId), idList(body.removeIds));
  return c.json(await getAppData(c.env.DB));
});

entries.post('/', async (c) => {
  const body = await jsonBody(c);
  const input = parseEntryInput(body);
  const projects = parseEntryProjects(body.projects);
  if (!input.bibkey) input.bibkey = await generateBibkey(httpFor(c.env), input);
  input.bibkey = await ensureUniqueBibkey(c.env.DB, input.bibkey, null);
  const id = await insertEntry(c.env.DB, input, todayJst(), projects);
  return c.json({ id });
});

entries.put('/:id', async (c) => {
  const id = parseIdParam(c.req.param('id'));
  const input = parseEntryInput(await jsonBody(c));
  if (!input.bibkey) input.bibkey = await generateBibkey(httpFor(c.env), input);
  input.bibkey = await ensureUniqueBibkey(c.env.DB, input.bibkey, id);
  await updateEntry(c.env.DB, id, input);
  return c.json({});
});

entries.delete('/:id', async (c) => {
  await deleteEntry(c.env.DB, parseIdParam(c.req.param('id')));
  return c.json({});
});

entries.patch('/:id/read', async (c) => {
  const body = await jsonBody(c);
  await setReadState(c.env.DB, parseIdParam(c.req.param('id')), str(body.state));
  return c.json({});
});

entries.patch('/:id/cite', async (c) => {
  const body = await jsonBody(c);
  // state 省略を「所属解除」と取り違えないよう文字列を必須にする ('' は解除)
  if (typeof body.state !== 'string') throw new AppError('リクエスト本文が不正です。');
  await setCiteState(c.env.DB, parseIdParam(c.req.param('id')), positiveInt(body.projectId), body.state);
  return c.json({});
});

entries.patch('/:id/flags', async (c) => {
  const id = parseIdParam(c.req.param('id'));
  const body = await jsonBody(c);
  await setFlags(c.env.DB, id, { starred: optBool(body.starred), priority: optPriority(body.priority) });
  return c.json({});
});

entries.post('/:id/touch', async (c) => {
  const id = parseIdParam(c.req.param('id'));
  const now = new Date().toISOString();
  await touchEntry(c.env.DB, id, now);
  return c.json({ lastOpenedAt: now });
});

export default entries;
