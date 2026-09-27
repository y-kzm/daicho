import { Hono } from 'hono';
import { getAppData } from '../db/app-data';
import { entriesToCsv } from '../db/maintenance';
import type { Env } from '../env';
import { AppError } from '../errors';

const exportRoute = new Hono<{ Bindings: Env }>();

exportRoute.get('/', async (c) => {
  const format = c.req.query('format') || 'json';
  const data = await getAppData(c.env.DB);
  if (format === 'json') {
    return new Response(JSON.stringify(data, null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="daicho.json"' },
    });
  }
  if (format === 'csv') {
    return new Response('﻿' + entriesToCsv(data.entries, data.projects), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="daicho.csv"' },
    });
  }
  throw new AppError('format は json か csv を指定してください。');
});

export default exportRoute;
