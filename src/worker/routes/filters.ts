import { Hono } from 'hono';
import { addFilter, deleteFilter, reorderFilters, updateFilter } from '../db/filters';
import type { Env } from '../env';
import { AppError } from '../errors';
import { parseIdParam } from '../validate';
import { jsonBody } from './context';

const filters = new Hono<{ Bindings: Env }>();

filters.post('/', async (c) => {
  const body = await jsonBody(c);
  const id = await addFilter(c.env.DB, body.name, body.query);
  return c.json({ id });
});

// 静的パスは /:id より前に登録する
filters.put('/order', async (c) => {
  const body = await jsonBody(c);
  if (!Array.isArray(body.ids)) throw new AppError('リクエスト本文が不正です。');
  await reorderFilters(c.env.DB, body.ids);
  return c.json({});
});

filters.patch('/:id', async (c) => {
  const id = parseIdParam(c.req.param('id'));
  const body = await jsonBody(c);
  await updateFilter(c.env.DB, id, { name: body.name, query: body.query });
  return c.json({});
});

filters.delete('/:id', async (c) => {
  await deleteFilter(c.env.DB, parseIdParam(c.req.param('id')));
  return c.json({});
});

export default filters;
