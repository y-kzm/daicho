import { Hono } from 'hono';
import type { Env } from '../env';
import { AppError } from '../errors';
import { fetchCoreRank } from '../services/core-rank';
import { fetchDoiMetadata } from '../services/doi';
import { str } from '../validate';
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

export default metadata;
