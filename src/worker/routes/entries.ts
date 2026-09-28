import { Hono } from 'hono';
import { getAppData } from '../db/app-data';
import { fileIdsForEntries } from '../db/attachments';
import { applyMerge } from '../db/merge';
import {
  bulkApply, deleteEntry, ensureUniqueBibkey, getEntry, insertEntry, setCiteState, setFlags, setReadState, touchEntry, updateEntry,
} from '../db/entries';
import { todayJst } from '../date';
import type { Env } from '../env';
import { AppError, notFound } from '../errors';
import { generateBibkey } from '../services/bibtex';
import { TRASH_MAX, trashBestEffort } from '../services/drive-session';
import {
  idList, optBool, optPriority, parseBulkOp, parseEntryInput, parseEntryProjects, parseIdParam, positiveInt, str,
} from '../validate';
import { httpFor, jsonBody } from './context';

const entries = new Hono<{ Bindings: Env }>();

// 静的パスは /:id より前に登録する
entries.post('/bulk', async (c) => {
  const body = await jsonBody(c);
  if (!Array.isArray(body.ids)) throw new AppError('リクエスト本文が不正です。');
  const ids = idList(body.ids);
  const op = parseBulkOp(body.op);
  // 論文を消すと添付の行も消えるので、Drive 側を片付けるための id を先に控える
  const files = op.type === 'delete' ? await fileIdsForEntries(c.env.DB, ids) : [];
  // 1 回で片付けられる数を超える場合は、消す前に断る (Drive に残った PDF を後から探せなくなるため)
  if (files.length > TRASH_MAX) {
    throw new AppError(`選択した論文には PDF が ${files.length} 件付いています。一度に削除できるのは PDF ${TRASH_MAX} 件分までです。選択を分けてください。`);
  }
  await bulkApply(c.env.DB, ids, op);
  const driveLeft = await trashBestEffort(c.env, files);
  return c.json({ ...(await getAppData(c.env.DB)), ...(driveLeft > 0 ? { driveLeft } : {}) });
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
  const body = await jsonBody(c);
  const input = parseEntryInput(body);
  // 種類と状態を送らない要求 (更新前から開いていた画面など) では、保存済みの値を保つ
  if (body.kind === undefined || body.docStatus === undefined) {
    const current = await getEntry(c.env.DB, id);
    if (!current) throw notFound('エントリ');
    if (body.kind === undefined) input.kind = current.kind;
    if (body.docStatus === undefined) input.docStatus = current.docStatus;
  }
  if (!input.bibkey) input.bibkey = await generateBibkey(httpFor(c.env), input);
  input.bibkey = await ensureUniqueBibkey(c.env.DB, input.bibkey, id);
  await updateEntry(c.env.DB, id, input);
  return c.json({});
});

entries.delete('/:id', async (c) => {
  const id = parseIdParam(c.req.param('id'));
  const files = await fileIdsForEntries(c.env.DB, [id]);
  await deleteEntry(c.env.DB, id);
  const driveLeft = await trashBestEffort(c.env, files);
  return c.json(driveLeft > 0 ? { driveLeft } : {});
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
