import { Hono } from 'hono';
import { addProject, deleteProject, reorderColumn, reorderProjects, updateProject, updateProjectEntry } from '../db/projects';
import type { Env } from '../env';
import { AppError } from '../errors';
import { parseIdParam, str } from '../validate';
import { jsonBody } from './context';

const projects = new Hono<{ Bindings: Env }>();

projects.post('/', async (c) => {
  const body = await jsonBody(c);
  const id = await addProject(c.env.DB, body.name);
  return c.json({ id });
});

// 静的パスは /:id より前に登録する
projects.put('/order', async (c) => {
  const body = await jsonBody(c);
  if (!Array.isArray(body.ids)) throw new AppError('リクエスト本文が不正です。');
  await reorderProjects(c.env.DB, body.ids);
  return c.json({});
});

projects.patch('/:id', async (c) => {
  const id = parseIdParam(c.req.param('id'));
  const body = await jsonBody(c);
  await updateProject(c.env.DB, id, { name: body.name, note: body.note, archived: body.archived });
  return c.json({});
});

projects.delete('/:id', async (c) => {
  await deleteProject(c.env.DB, parseIdParam(c.req.param('id')));
  return c.json({});
});

projects.put('/:id/order', async (c) => {
  const id = parseIdParam(c.req.param('id'));
  const body = await jsonBody(c);
  if (!Array.isArray(body.entryIds)) throw new AppError('リクエスト本文が不正です。');
  await reorderColumn(c.env.DB, id, str(body.state), body.entryIds);
  return c.json({});
});

projects.patch('/:id/entries/:entryId', async (c) => {
  const id = parseIdParam(c.req.param('id'));
  const entryId = parseIdParam(c.req.param('entryId'));
  const body = await jsonBody(c);
  await updateProjectEntry(c.env.DB, id, entryId, { state: body.state, memo: body.memo });
  return c.json({});
});

export default projects;
