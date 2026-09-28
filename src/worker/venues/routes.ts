import { Hono } from 'hono';
import type { Context } from 'hono';
import { editionTitle, estimateNext, type VenueData } from '../../shared/venues';
import type { Env } from '../env';
import { AppError } from '../errors';
import { httpFor, jsonBody } from '../routes/context';
import { parseIdParam, str } from '../validate';
import {
  deleteEdition, deleteVenue, getCalendarToken, getEdition, getVenue, importVenue, insertEdition, insertVenue, loadVenues,
  setArchived, setCalendarToken, updateEdition, updateVenue,
} from './db';
import { extractEdition } from './extract';
import { buildIcs } from './ics';
import { findSite, isPublicUrl } from './site';
import { parseEditionInput, parseVenueImport, parseVenueInput, webUrl } from './validate';
import { loadWikicfpEvent, searchWikicfp } from './wikicfp';

const venues = new Hono<{ Bindings: Env }>();

/** カレンダーに出す過去の範囲 (これより前に終わった予定は出さない) */
const CALENDAR_PAST_DAYS = 180;

async function data(db: D1Database): Promise<VenueData> {
  const [list, calendarToken] = await Promise.all([loadVenues(db), getCalendarToken(db)]);
  return { venues: list, calendarToken };
}

const idOf = (c: Context, name = 'id'): number => parseIdParam(c.req.param(name) ?? '');

export function calendarBody(list: VenueData['venues'], includeEstimated: boolean, now = new Date()): string {
  return buildIcs(list, { now, includeEstimated, since: new Date(now.getTime() - CALENDAR_PAST_DAYS * 86400000) });
}

const ICS_HEADERS = { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=900' };

venues.get('/', async (c) => c.json(await data(c.env.DB)));

// 静的なパスは /:id より前に登録する
venues.post('/import', async (c) => {
  const summary = await importVenue(c.env.DB, parseVenueImport(await jsonBody(c)), new Date().toISOString());
  return c.json({ ...(await data(c.env.DB)), summary });
});

// WikiCFP から会議を探す (保存はしない。選んだものを /import で取り込む)
venues.get('/wikicfp/search', async (c) => c.json({ hits: await searchWikicfp(c.req.query('q') ?? '') }));

venues.get('/wikicfp/events/:id', async (c) => c.json(await loadWikicfpEvent(idOf(c))));

venues.get('/calendar.ics', async (c) => {
  const body = calendarBody(await loadVenues(c.env.DB), c.req.query('estimated') !== '0');
  return new Response(body, { headers: { ...ICS_HEADERS, 'content-disposition': 'attachment; filename="daicho-venues.ics"' } });
});

// 購読用のトークンを発行する。作り直すと、以前の URL は使えなくなる
venues.post('/calendar/token', async (c) => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  await setCalendarToken(c.env.DB, Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
  return c.json(await data(c.env.DB));
});

venues.delete('/calendar/token', async (c) => {
  await setCalendarToken(c.env.DB, null);
  return c.json(await data(c.env.DB));
});

venues.post('/', async (c) => {
  const id = await insertVenue(c.env.DB, parseVenueInput(await jsonBody(c)), new Date().toISOString());
  return c.json({ ...(await data(c.env.DB)), id });
});

venues.put('/:id', async (c) => {
  await updateVenue(c.env.DB, idOf(c), parseVenueInput(await jsonBody(c)));
  return c.json(await data(c.env.DB));
});

venues.patch('/:id/archived', async (c) => {
  const body = await jsonBody(c);
  if (typeof body.archived !== 'boolean') throw new AppError('リクエスト本文が不正です。');
  await setArchived(c.env.DB, idOf(c), body.archived);
  return c.json(await data(c.env.DB));
});

venues.delete('/:id', async (c) => {
  await deleteVenue(c.env.DB, idOf(c));
  return c.json(await data(c.env.DB));
});

venues.post('/:id/editions', async (c) => {
  const id = await insertEdition(c.env.DB, idOf(c), parseEditionInput(await jsonBody(c)));
  return c.json({ ...(await data(c.env.DB)), id });
});

// 次の年の開催を、最新の開催から「予想」として作る。サイトは年を置き換えた候補を実際に確かめる
venues.post('/:id/editions/next', async (c) => {
  const venue = await getVenue(c.env.DB, idOf(c));
  const latest = [...venue.editions].filter((e) => !e.label).sort((a, b) => b.year - a.year)[0];
  if (!latest) throw new AppError('元にする開催がありません。先に 1 件登録してください。');
  const next = estimateNext(latest, latest.year + 1);
  const id = await insertEdition(c.env.DB, venue.id, next);
  const fresh = await getEdition(c.env.DB, id);
  const found = await findSite(fresh.venue, fresh.edition);
  if (found.siteUrl) await updateEdition(c.env.DB, id, { ...next, siteUrl: found.siteUrl });
  return c.json({ ...(await data(c.env.DB)), id, site: found });
});

venues.put('/editions/:id', async (c) => {
  await updateEdition(c.env.DB, idOf(c), parseEditionInput(await jsonBody(c)));
  return c.json(await data(c.env.DB));
});

venues.delete('/editions/:id', async (c) => {
  await deleteEdition(c.env.DB, idOf(c));
  return c.json(await data(c.env.DB));
});

// その年のサイトを探す (保存はしない。見つかった URL を画面が入力欄に入れる)
venues.post('/editions/:id/find-site', async (c) => {
  const { venue, edition } = await getEdition(c.env.DB, idOf(c));
  return c.json(await findSite(venue, edition));
});

// サイトから日程の候補を読み取る (保存はしない)
venues.post('/editions/:id/extract', async (c) => {
  const body = await jsonBody(c);
  const { venue, edition } = await getEdition(c.env.DB, idOf(c));
  const pageUrl = webUrl(body.url, 'サイトの URL') || edition.siteUrl;
  if (!pageUrl) throw new AppError('サイトの URL を入力してください。');
  if (!isPublicUrl(pageUrl)) throw new AppError('この URL は取得できません。');
  const provider = str(body.provider) === 'claude' ? 'claude' : 'gemini';
  return c.json(await extractEdition(httpFor(c.env), c.env, provider, { title: editionTitle(venue, edition), year: edition.year, pageUrl }));
});

export default venues;

/* ---------- Access の外から取得する購読用の URL ---------- */

function sameToken(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** GET /cal/<token>.ics。トークンが合わなければ、存在しないものとして 404 を返す */
export async function publicCalendar(c: Context<{ Bindings: Env }>): Promise<Response> {
  const given = (c.req.param('file') ?? '').replace(/\.ics$/i, '');
  // 形の違うものは、データベースを読む前に断る
  if (!/^[0-9a-f]{48}$/.test(given)) return c.text('Not found', 404);
  const token = await getCalendarToken(c.env.DB);
  if (!token || !sameToken(given, token)) return c.text('Not found', 404);
  const body = calendarBody(await loadVenues(c.env.DB), c.req.query('estimated') !== '0');
  return new Response(body, { headers: { ...ICS_HEADERS, 'x-robots-tag': 'noindex' } });
}
