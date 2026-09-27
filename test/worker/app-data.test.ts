import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAppData, loadEntries } from '../../src/worker/db/app-data';

async function seed() {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO entries (id, added, title, doi, year) VALUES (1, '2026-01-02', 'Paper A', '10.1/a', '2024')"),
    env.DB.prepare(
      "INSERT INTO entries (id, added, title, read, starred, priority, last_opened_at) VALUES (2, '2026-01-01', 'Paper B', '精読済', 1, 3, '2026-09-01T00:00:00.000Z')",
    ),
    env.DB.prepare("INSERT INTO tags (id, name, sort_order) VALUES (1, 'IPv6', 2), (2, 'NDP', 1)"),
    env.DB.prepare('INSERT INTO entry_tags (entry_id, tag_id, position) VALUES (1, 1, 1), (1, 2, 0)'),
    env.DB.prepare("INSERT INTO projects (id, name, sort_order, note, archived) VALUES (1, '論文A', 0, '締切 10 月', 0), (2, '論文B', 1, '', 1)"),
    env.DB.prepare(
      "INSERT INTO cites (entry_id, project_id, state, position, memo) VALUES (2, 1, '引用する', 2, '背景で引用'), (1, 1, '気になる', 0, '')",
    ),
    env.DB.prepare(
      `INSERT INTO saved_filters (id, name, sort_order, query) VALUES (1, 'スター', 1, '{"starred":true}'), (2, '壊れた', 0, '{oops')`,
    ),
  ]);
}

describe('getAppData', () => {
  beforeEach(seed);

  it('assembles entries with tags, flags and cites keyed by project id', async () => {
    const d = await getAppData(env.DB);
    expect(d.entries.map((e) => e.id)).toEqual([1, 2]);
    expect(d.entries[0]).toMatchObject({
      id: 1, added: '2026-01-02', title: 'Paper A', doi: '10.1/a', year: '2024', tags: ['NDP', 'IPv6'], read: '未読',
      starred: false, priority: 0, lastOpenedAt: '',
      cites: { '1': { state: '気になる', position: 0, memo: '' } },
    });
    expect(d.entries[1]).toMatchObject({
      read: '精読済', tags: [], starred: true, priority: 3, lastOpenedAt: '2026-09-01T00:00:00.000Z',
      cites: { '1': { state: '引用する', position: 2, memo: '背景で引用' } },
    });
  });

  it('lists projects as objects with cite counts', async () => {
    const d = await getAppData(env.DB);
    expect(d.projects).toEqual([
      { id: 1, name: '論文A', note: '締切 10 月', archived: false, sortOrder: 0, count: 2 },
      { id: 2, name: '論文B', note: '', archived: true, sortOrder: 1, count: 0 },
    ]);
  });

  it('lists saved filters by sort_order and reads broken JSON as an empty query', async () => {
    const d = await getAppData(env.DB);
    expect(d.savedFilters).toEqual([
      { id: 2, name: '壊れた', sortOrder: 0, query: {} },
      { id: 1, name: 'スター', sortOrder: 1, query: { starred: true } },
    ]);
  });

  it('includes tags and constants, and no layout', async () => {
    const d = await getAppData(env.DB);
    expect(d.tags).toEqual(['NDP', 'IPv6']);
    expect(d.readStates).toEqual(['未読', '斜め読み', '精読済']);
    expect(d.citeStates).toEqual(['気になる', '引用候補', '引用する', '引用しない']);
    expect(d.links.jcr).toContain('jcr.clarivate.com');
    expect('layout' in d).toBe(false);
  });

  it('reads an out-of-range priority as 0', async () => {
    await env.DB.prepare('UPDATE entries SET priority = 9 WHERE id = 1').run();
    expect((await loadEntries(env.DB))[0]!.priority).toBe(0);
  });
});
