import { Hono } from 'hono';
import { loadEntries } from '../db/app-data';
import { backfillCountries, backfillVenueRatings, listDuplicates } from '../db/maintenance';
import type { Env } from '../env';
import { httpFor } from './context';

const maintenance = new Hono<{ Bindings: Env }>();

async function bodyOf(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  return (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
}

function dryRunOf(body: Record<string, unknown>): boolean {
  return body.dryRun !== false; // 既定は dry run
}

function pageOf(body: Record<string, unknown>): { offset: number; limit: number } {
  const offset = Number.isInteger(body.offset) && (body.offset as number) >= 0 ? (body.offset as number) : 0;
  const rawLimit = Number.isInteger(body.limit) ? (body.limit as number) : 15;
  const limit = Math.min(15, Math.max(1, rawLimit));
  return { offset, limit };
}

maintenance.get('/duplicates', async (c) => c.json({ groups: listDuplicates(await loadEntries(c.env.DB)) }));
maintenance.post('/backfill-venue-ratings', async (c) => c.json(await backfillVenueRatings(c.env.DB, dryRunOf(await bodyOf(c)))));
maintenance.post('/backfill-countries', async (c) => {
  const body = await bodyOf(c);
  const { offset, limit } = pageOf(body);
  return c.json(await backfillCountries(c.env.DB, httpFor(c.env), dryRunOf(body), offset, limit));
});

export default maintenance;
