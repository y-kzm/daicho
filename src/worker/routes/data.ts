import { Hono } from 'hono';
import { getAppData } from '../db/app-data';
import type { Env } from '../env';

const data = new Hono<{ Bindings: Env }>();
data.get('/', async (c) => c.json(await getAppData(c.env.DB)));
export default data;
