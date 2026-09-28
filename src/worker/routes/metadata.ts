import { Hono } from 'hono';
import type { Env } from '../env';
import { AppError } from '../errors';
import { fetchCoreRank } from '../services/core-rank';
import { fetchDoiMetadata } from '../services/doi';
import { getEntry } from '../db/entries';
import { notFound } from '../errors';
import { fetchIetfStatus, ietfRefOf } from '../services/ietf-status';
import { DOC_STATUS_MAX, positiveInt, str } from '../validate';
import { httpFor, jsonBody } from './context';

const metadata = new Hono<{ Bindings: Env }>();

metadata.post('/doi', async (c) => {
  const body = await jsonBody(c);
  const input = str(body.input);
  if (!input) throw new AppError('DOI または DOI を含む URL を入力してください');
  return c.json(await fetchDoiMetadata(httpFor(c.env), input));
});

metadata.post('/core', async (c) => {
  const body = await jsonBody(c);
  return c.json(await fetchCoreRank(httpFor(c.env), str(body.query)));
});

// RFC / Internet-Draft の今の状態を調べ、エントリの「状態」に保存する
metadata.post('/ietf-status', async (c) => {
  const body = await jsonBody(c);
  const id = positiveInt(body.entryId);
  const entry = await getEntry(c.env.DB, id);
  if (!entry) throw notFound('エントリ');
  if (entry.kind !== 'rfc' && entry.kind !== 'draft') throw new AppError('状態を確認できるのは、種類が RFC または Internet-Draft の文献です。');
  const ref = ietfRefOf(entry);
  if (!ref) throw new AppError('RFC 番号または Internet-Draft 名を特定できませんでした。BibTeX キーかタイトルに rfc8200 や draft-... を入れてください。');
  const status = await fetchIetfStatus(httpFor(c.env), ref);
  if (!status) throw new AppError('IETF Datatracker に文書が見つかりませんでした。', 404);
  const docStatus = status.docStatus.slice(0, DOC_STATUS_MAX);
  await c.env.DB.prepare('UPDATE entries SET doc_status = ? WHERE id = ?').bind(docStatus, id).run();
  return c.json({ ...status, docStatus });
});

export default metadata;
