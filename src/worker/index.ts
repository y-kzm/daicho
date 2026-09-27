import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env } from './env';
import { AppError } from './errors';
import attachments from './routes/attachments';
import bibtex from './routes/bibtex';
import data from './routes/data';
import drive from './routes/drive';
import entries from './routes/entries';
import exportRoute from './routes/export';
import filters from './routes/filters';
import llm from './routes/llm';
import maintenance from './routes/maintenance';
import metadata from './routes/metadata';
import projects from './routes/projects';
import tags from './routes/tags';
import { sameOriginOnly } from './same-origin';

export type App = Hono<{ Bindings: Env }>;

export function createApp(): App {
  const app: App = new Hono();
  const api: App = new Hono();

  api.use('*', sameOriginOnly);
  api.get('/health', (c) => c.json({ ok: true }));
  api.route('/data', data);
  api.route('/entries', entries);
  api.route('/tags', tags);
  api.route('/projects', projects);
  api.route('/filters', filters);
  api.route('/metadata', metadata);
  api.route('/llm', llm);
  api.route('/bibtex', bibtex);
  api.route('/export', exportRoute);
  api.route('/maintenance', maintenance);
  api.route('/attachments', attachments);
  api.route('/drive', drive);
  app.route('/api', api);

  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: err.message }, err.status as ContentfulStatusCode);
    console.error(err);
    return c.json({ error: 'サーバー内部でエラーが発生しました。' }, 500);
  });

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
    return c.env.ASSETS.fetch(c.req.raw);
  });

  return app;
}

export default createApp();
