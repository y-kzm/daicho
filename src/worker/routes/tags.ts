import { Hono } from 'hono';
import { getAppData } from '../db/app-data';
import { getEntriesByIds } from '../db/entries';
import { addTag, deleteTag, ensureTagStatements, entryTagStatements, renameTag, reorderTags } from '../db/tags';
import type { Env } from '../env';
import { AppError } from '../errors';
import { idList, splitTags } from '../validate';
import { jsonBody } from './context';

const tags = new Hono<{ Bindings: Env }>();

tags.post('/', async (c) => {
  const body = await jsonBody(c);
  await addTag(c.env.DB, body.name);
  return c.json(await getAppData(c.env.DB));
});

tags.put('/order', async (c) => {
  const body = await jsonBody(c);
  await reorderTags(c.env.DB, body.order);
  return c.json(await getAppData(c.env.DB));
});

tags.post('/apply', async (c) => {
  const body = await jsonBody(c);
  const proposals = (Array.isArray(body.proposals) ? body.proposals : []) as { id?: unknown; tags?: unknown }[];
  const validIds = new Set(idList(proposals.map((p) => p.id)));
  const items = proposals
    .filter((p) => validIds.has(Number(p.id)))
    .map((p) => ({ id: Number(p.id), tags: splitTags(p.tags) }));
  if (!items.length) throw new AppError('適用対象がありません。');
  const existing = new Set((await getEntriesByIds(c.env.DB, items.map((p) => p.id))).map((e) => e.id));
  // 存在しないエントリの提案タグは登録しない (孤立タグの防止)
  const applicable = items.filter((p) => existing.has(p.id));
  if (applicable.length) {
    await c.env.DB.batch([
      ...ensureTagStatements(c.env.DB, applicable.flatMap((p) => p.tags)),
      ...applicable.flatMap((p) => entryTagStatements(c.env.DB, p.id, p.tags)),
    ]);
  }
  return c.json(await getAppData(c.env.DB));
});

tags.patch('/:name', async (c) => {
  const body = await jsonBody(c);
  await renameTag(c.env.DB, c.req.param('name'), body.name);
  return c.json(await getAppData(c.env.DB));
});

tags.delete('/:name', async (c) => {
  await deleteTag(c.env.DB, c.req.param('name'));
  return c.json(await getAppData(c.env.DB));
});

export default tags;
