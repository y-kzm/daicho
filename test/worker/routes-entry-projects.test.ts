import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AppData } from '../../src/shared/types';
import { mockFetch } from './fetch-mock';
import { seedCite, seedEntry, seedProject } from './helpers';
import { call, type ErrorBody } from './request';

async function data(): Promise<AppData> {
  return (await call<AppData>('GET', '/api/data')).json;
}

async function add(body: Record<string, unknown>) {
  mockFetch([{ match: /.*/, status: 404, body: '' }]);
  return call<{ id: number } & ErrorBody>('POST', '/api/entries', body);
}

describe('POST /api/entries with projects', () => {
  it('adds the entry to each project at the end of its column', async () => {
    const p = await seedProject(env.DB, 'P');
    const q = await seedProject(env.DB, 'Q');
    const old = await seedEntry(env.DB, { title: 'Old' });
    await seedCite(env.DB, old, p, '気になる');
    const r = await add({
      title: 'New', bibkey: 'new2026',
      projects: [{ projectId: p, state: '気になる' }, { projectId: q, state: '引用する' }],
    });
    expect(r.status).toBe(200);
    const d = await data();
    const e = d.entries.find((x) => x.id === r.json.id)!;
    expect(e.cites[String(p)]).toMatchObject({ state: '気になる', memo: '' });
    expect(e.cites[String(q)]).toMatchObject({ state: '引用する', position: 0, memo: '' });
    const oldPos = d.entries.find((x) => x.id === old)!.cites[String(p)]!.position;
    expect(e.cites[String(p)]!.position).toBeGreaterThan(oldPos);
    expect(d.projects.find((x) => x.id === p)!.count).toBe(2);
  });

  it('treats a missing or empty projects field as no membership', async () => {
    const r = await add({ title: 'Plain', bibkey: 'plain' });
    expect(r.status).toBe(200);
    expect((await data()).entries[0]!.cites).toEqual({});
    const r2 = await add({ title: 'Plain 2', bibkey: 'plain2', projects: [] });
    expect(r2.status).toBe(200);
  });

  it('adds nothing when a project does not exist', async () => {
    const p = await seedProject(env.DB, 'P');
    const r = await add({ title: 'X', bibkey: 'x', projects: [{ projectId: p, state: '気になる' }, { projectId: 999, state: '気になる' }] });
    expect(r.status).toBe(404);
    expect((await data()).entries).toEqual([]);
  });

  it('rejects bad shapes, bad states and duplicate projects with 400', async () => {
    const p = await seedProject(env.DB, 'P');
    const bad: unknown[] = [
      'x',
      [{ projectId: p, state: '' }],
      [{ projectId: p, state: 'nope' }],
      [{ projectId: 'abc', state: '気になる' }],
      [{ projectId: p, state: '気になる' }, { projectId: p, state: '引用する' }],
      Array.from({ length: 21 }, (_, i) => ({ projectId: i + 1, state: '気になる' })),
    ];
    for (const projects of bad) {
      const r = await add({ title: 'X', bibkey: 'x', projects });
      expect(r.status, JSON.stringify(projects)).toBe(400);
    }
    expect((await data()).entries).toEqual([]);
  });
});
