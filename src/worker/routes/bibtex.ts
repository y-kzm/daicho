import { Hono } from 'hono';
import { loadEntries } from '../db/app-data';
import { getEntriesByIds } from '../db/entries';
import type { Env } from '../env';
import { exportBibtex } from '../services/bibtex';
import { idList } from '../validate';
import { httpFor, jsonBody } from './context';

const bibtex = new Hono<{ Bindings: Env }>();

/** ids: number[] で対象を指定、null / 省略で全件 */
bibtex.post('/', async (c) => {
  const body = await jsonBody(c);
  const ids = Array.isArray(body.ids) ? idList(body.ids) : null;
  const entries = ids ? await getEntriesByIds(c.env.DB, ids) : await loadEntries(c.env.DB);
  return c.json({ bibtex: await exportBibtex(httpFor(c.env), entries) });
});

export default bibtex;
