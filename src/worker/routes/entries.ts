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
import { oaStatement, setOpenAccess, uncheckedOa } from '../db/open-access';
import { lookupOpenAccess, normalizeDoi, OA_BATCH } from '../services/open-access';
import { OA_STATUSES, type OaStatus } from '../../shared/types';

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

// Open Access をまだ判定していない論文を、最大 OA_BATCH 件ずつ判定する。画面は remaining が 0 になるまで呼ぶ
entries.post('/oa/check', async (c) => {
  const { items, total } = await uncheckedOa(c.env.DB, OA_BATCH);
  const today = todayJst();
  const found = await lookupOpenAccess(httpFor(c.env), items.map((i) => i.doi), today);
  // DOI の形が読めないものは unknown にする。問い合わせに失敗したものは保存せず、次の判定で調べ直す
  const done = items.flatMap((i) => {
    const d = normalizeDoi(i.doi);
    const oa = d ? found.get(d) : { status: 'unknown' as const, url: '', license: '', checkedAt: today };
    return oa ? [oaStatement(c.env.DB, i.id, oa)] : [];
  });
  if (done.length) await c.env.DB.batch(done);
  return c.json({ checked: done.length, failed: items.length - done.length, remaining: total - done.length, ...(await getAppData(c.env.DB)) });
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

// 1 件を判定し直す
entries.post('/:id/oa', async (c) => {
  const id = parseIdParam(c.req.param('id'));
  const e = await getEntry(c.env.DB, id);
  if (!e) throw notFound('エントリ');
  if (!e.doi) throw new AppError('DOI が無いので判定できません。手で設定してください。');
  const today = todayJst();
  if (!normalizeDoi(e.doi)) throw new AppError('DOI の形が正しくないので判定できません。DOI を直すか、手で設定してください。');
  const oa = (await lookupOpenAccess(httpFor(c.env), [e.doi], today)).get(normalizeDoi(e.doi));
  if (!oa) throw new AppError('OpenAlex から取得できませんでした。時間をおいてやり直してください。', 502);
  await setOpenAccess(c.env.DB, id, oa);
  return c.json({ oa });
});

// 手で設定する (DOI の無い論文など)。status が空なら未判定に戻す
entries.put('/:id/oa', async (c) => {
  const id = parseIdParam(c.req.param('id'));
  const body = await jsonBody(c);
  const status = str(body.status);
  if (status && !(OA_STATUSES as readonly string[]).includes(status)) throw new AppError('Open Access の種類が不正です。');
  const url = str(body.url);
  if (url && (url.length > 500 || !/^https?:\/\/[^\s]+$/i.test(url))) throw new AppError('URL は http または https で始まる形にしてください。');
  const oa = { status: status as OaStatus, url: status && status !== 'closed' ? url : '', license: '', checkedAt: status ? todayJst() : '' };
  await setOpenAccess(c.env.DB, id, oa);
  return c.json({ oa });
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
