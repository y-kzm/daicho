import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addProject, assertProjectName, deleteProject, listProjects, reorderColumn, reorderProjects, updateProject,
  updateProjectEntry,
} from '../../src/worker/db/projects';
import { seedCite } from './helpers';

describe('projects', () => {
  beforeEach(async () => {
    await env.DB.prepare("INSERT INTO entries (id, added, title) VALUES (1, '2026-01-01', 'A'), (2, '2026-01-01', 'B')").run();
  });

  it('assertProjectName rejects commas and colons', () => {
    expect(assertProjectName(' 論文A ')).toBe('論文A');
    expect(() => assertProjectName('')).toThrow('プロジェクト名を入力してください。');
    for (const bad of ['a,b', 'a、b', 'a:b', 'a：b']) {
      expect(() => assertProjectName(bad)).toThrow('プロジェクト名にカンマとコロンは使えません。');
    }
  });

  it('addProject returns the new id, appends to the end and rejects duplicates', async () => {
    const a = await addProject(env.DB, 'P2');
    const b = await addProject(env.DB, 'P1');
    expect(b).toBeGreaterThan(a);
    expect(await listProjects(env.DB)).toEqual([
      { id: a, name: 'P2', note: '', archived: false, sortOrder: 1, count: 0 },
      { id: b, name: 'P1', note: '', archived: false, sortOrder: 2, count: 0 },
    ]);
    await expect(addProject(env.DB, 'P1')).rejects.toMatchObject({ status: 409 });
  });

  it('listProjects counts members', async () => {
    const p = await addProject(env.DB, 'P');
    await seedCite(env.DB, 1, p, '気になる');
    await seedCite(env.DB, 2, p, '引用する');
    expect((await listProjects(env.DB))[0]!.count).toBe(2);
  });

  it('listProjects orders by sort_order and populates count / note / archived', async () => {
    const a = await addProject(env.DB, 'A');
    const b = await addProject(env.DB, 'B');
    await updateProject(env.DB, a, { note: 'memo A', archived: true });
    await seedCite(env.DB, 1, b, '気になる');
    await reorderProjects(env.DB, [b, a]);
    expect(await listProjects(env.DB)).toEqual([
      { id: b, name: 'B', note: '', archived: false, sortOrder: 0, count: 1 },
      { id: a, name: 'A', note: 'memo A', archived: true, sortOrder: 1, count: 0 },
    ]);
  });

  it('updateProject patches name / note / archived independently', async () => {
    const p = await addProject(env.DB, 'P');
    await updateProject(env.DB, p, { note: '締切 10 月' });
    await updateProject(env.DB, p, { archived: true });
    await updateProject(env.DB, p, { name: 'Q' });
    expect((await listProjects(env.DB))[0]).toMatchObject({ id: p, name: 'Q', note: '締切 10 月', archived: true });
    await updateProject(env.DB, p, { name: 'Q' });
    await updateProject(env.DB, p, { archived: false });
    expect((await listProjects(env.DB))[0]!.archived).toBe(false);
  });

  it('updateProject validates input and reports conflicts', async () => {
    const p = await addProject(env.DB, 'P');
    await addProject(env.DB, 'R');
    await expect(updateProject(env.DB, p, { name: 'R' })).rejects.toMatchObject({ status: 409 });
    await expect(updateProject(env.DB, p, { name: '' })).rejects.toThrow('プロジェクト名を入力してください。');
    await expect(updateProject(env.DB, p, { archived: 'yes' })).rejects.toThrow('リクエスト本文が不正です。');
    await expect(updateProject(env.DB, p, { note: 3 })).rejects.toThrow('リクエスト本文が不正です。');
    await expect(updateProject(env.DB, 999, { note: 'x' })).rejects.toThrow('プロジェクトが見つかりません。');
  });

  it('deleteProject removes its cites', async () => {
    const p = await addProject(env.DB, 'P');
    await seedCite(env.DB, 1, p, '引用する');
    await deleteProject(env.DB, p);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM cites').first<{ n: number }>();
    expect(n?.n).toBe(0);
    expect(await listProjects(env.DB)).toEqual([]);
    await expect(deleteProject(env.DB, p)).rejects.toMatchObject({ status: 404 });
  });

  it('reorderProjects requires exactly the current id set', async () => {
    const a = await addProject(env.DB, 'A');
    const b = await addProject(env.DB, 'B');
    await reorderProjects(env.DB, [b, a]);
    expect((await listProjects(env.DB)).map((p) => p.id)).toEqual([b, a]);
    for (const bad of [[a], [a, a], [a, b, 999]]) {
      await expect(reorderProjects(env.DB, bad)).rejects.toMatchObject({ status: 409 });
    }
    for (const bad of ['x', [a, 'x'], [a, 0]]) {
      await expect(reorderProjects(env.DB, bad)).rejects.toMatchObject({ status: 400, message: 'リクエスト本文が不正です。' });
    }
  });
});

describe('project columns', () => {
  let p = 0;

  async function column(state: string): Promise<{ entry_id: number; position: number; memo: string }[]> {
    const r = await env.DB
      .prepare('SELECT entry_id, position, memo FROM cites WHERE project_id = ? AND state = ? ORDER BY position, entry_id')
      .bind(p, state)
      .all<{ entry_id: number; position: number; memo: string }>();
    return r.results;
  }

  beforeEach(async () => {
    await env.DB.prepare(
      "INSERT INTO entries (id, added, title) VALUES (1, '2026-01-01', 'A'), (2, '2026-01-01', 'B'), (3, '2026-01-01', 'C'), (4, '2026-01-01', 'D')",
    ).run();
    p = await addProject(env.DB, 'P');
    await seedCite(env.DB, 1, p, '気になる', 0);
    await seedCite(env.DB, 2, p, '気になる', 1);
    await seedCite(env.DB, 3, p, '引用する', 0);
  });

  it('reorderColumn renumbers positions in the given order', async () => {
    await reorderColumn(env.DB, p, '気になる', [2, 1]);
    expect(await column('気になる')).toEqual([
      { entry_id: 2, position: 0, memo: '' },
      { entry_id: 1, position: 1, memo: '' },
    ]);
  });

  it('reorderColumn rejects a stale set (409), a bad state (400) and a missing project (404)', async () => {
    for (const bad of [[1], [1, 2, 3], [1, 1]]) {
      await expect(reorderColumn(env.DB, p, '気になる', bad)).rejects.toMatchObject({ status: 409 });
    }
    await expect(reorderColumn(env.DB, p, '気になる', 'x')).rejects.toMatchObject({ status: 400 });
    await expect(reorderColumn(env.DB, p, '', [1, 2])).rejects.toThrow('引用状態が不正です。');
    await expect(reorderColumn(env.DB, 999, '気になる', [1, 2])).rejects.toThrow('プロジェクトが見つかりません。');
  });

  it('updateProjectEntry sets memo without moving the card', async () => {
    await updateProjectEntry(env.DB, p, 1, { memo: '関連研究で引用' });
    expect(await column('気になる')).toEqual([
      { entry_id: 1, position: 0, memo: '関連研究で引用' },
      { entry_id: 2, position: 1, memo: '' },
    ]);
  });

  it('updateProjectEntry moves a card to the end of the target column; same state is a no-op', async () => {
    await updateProjectEntry(env.DB, p, 1, { state: '引用する', memo: 'm' });
    expect(await column('引用する')).toEqual([
      { entry_id: 3, position: 0, memo: '' },
      { entry_id: 1, position: 1, memo: 'm' },
    ]);
    await updateProjectEntry(env.DB, p, 1, { state: '引用する' });
    expect((await column('引用する'))[1]).toEqual({ entry_id: 1, position: 1, memo: 'm' });
  });

  it('updateProjectEntry validates and 404s for non-members', async () => {
    await expect(updateProjectEntry(env.DB, p, 1, { state: 'x' })).rejects.toThrow('引用状態が不正です。');
    await expect(updateProjectEntry(env.DB, p, 1, { memo: 3 })).rejects.toThrow('リクエスト本文が不正です。');
    await expect(updateProjectEntry(env.DB, p, 4, { memo: 'x' })).rejects.toThrow('エントリが見つかりません。');
    await expect(updateProjectEntry(env.DB, 999, 1, { memo: 'x' })).rejects.toThrow('プロジェクトが見つかりません。');
  });
});
