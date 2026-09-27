import { applyD1Migrations, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('migration 0002_library_ux', () => {
  it('adds entry flags with defaults', async () => {
    await env.DB.prepare("INSERT INTO entries (id, added, title) VALUES (1, '2026-01-01', 'A')").run();
    const e = await env.DB.prepare('SELECT starred, priority, last_opened_at FROM entries WHERE id = 1').first();
    expect(e).toEqual({ starred: 0, priority: 0, last_opened_at: '' });
  });

  it('adds project note / archived and cite position / memo with defaults', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO entries (id, added, title) VALUES (1, '2026-01-01', 'A')"),
      env.DB.prepare("INSERT INTO projects (id, name, sort_order) VALUES (1, 'P', 0)"),
      env.DB.prepare("INSERT INTO cites (entry_id, project_id, state) VALUES (1, 1, '気になる')"),
    ]);
    expect(await env.DB.prepare('SELECT note, archived FROM projects WHERE id = 1').first()).toEqual({ note: '', archived: 0 });
    expect(await env.DB.prepare('SELECT position, memo FROM cites WHERE entry_id = 1').first()).toEqual({ position: 0, memo: '' });
  });

  it('creates saved_filters and the last_opened index', async () => {
    await env.DB.prepare("INSERT INTO saved_filters (name, sort_order, query) VALUES ('F', 0, '{}')").run();
    expect(await env.DB.prepare('SELECT id, name, sort_order, query FROM saved_filters').first()).toEqual({ id: 1, name: 'F', sort_order: 0, query: '{}' });
    const idx = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").bind('idx_entries_last_opened').first<{ name: string }>();
    expect(idx?.name).toBe('idx_entries_last_opened');
  });

  it('upgrades a populated 0001 database with defaults on existing rows', async () => {
    // setup で 0001+0002 が適用済みなので、いったん全テーブルを落として 0001 だけを当て直す
    for (const t of ['attachments', 'drive_auth', 'entry_tags', 'cites', 'saved_filters', 'settings', 'tags', 'projects', 'entries', 'd1_migrations']) {
      await env.DB.prepare(`DROP TABLE IF EXISTS ${t}`).run();
    }
    const [first] = env.TEST_MIGRATIONS;
    expect(first!.name).toBe('0001_init.sql');
    await applyD1Migrations(env.DB, [first!]);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO entries (id, added, title) VALUES (1, '2026-01-01', 'A')"),
      env.DB.prepare("INSERT INTO projects (id, name, sort_order) VALUES (1, 'P', 0)"),
      env.DB.prepare("INSERT INTO cites (entry_id, project_id, state) VALUES (1, 1, '気になる')"),
      env.DB.prepare("INSERT INTO settings (key, value) VALUES ('layout', '[]')"),
    ]);
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    expect(await env.DB.prepare('SELECT starred, priority, last_opened_at FROM entries WHERE id = 1').first())
      .toEqual({ starred: 0, priority: 0, last_opened_at: '' });
    expect(await env.DB.prepare('SELECT note, archived FROM projects WHERE id = 1').first()).toEqual({ note: '', archived: 0 });
    expect(await env.DB.prepare('SELECT state, position, memo FROM cites WHERE entry_id = 1').first())
      .toEqual({ state: '気になる', position: 0, memo: '' });
    const sf = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_filters'").first<{ name: string }>();
    expect(sf?.name).toBe('saved_filters');
    expect(await env.DB.prepare("SELECT value FROM settings WHERE key = 'layout'").first()).toEqual({ value: '[]' });
  });
});
