import type { CiteState, Project } from '../../shared/types';
import { AppError, notFound } from '../errors';
import { idList, optBool, parseCiteState, sameIdSet } from '../validate';
import { PROJECTS_SQL, rowToProject, type ProjectRow } from './app-data';

export function assertProjectName(name: unknown): string {
  const p = String(name ?? '').trim();
  if (!p) throw new AppError('プロジェクト名を入力してください。');
  if (/[,、:：]/.test(p)) throw new AppError('プロジェクト名にカンマとコロンは使えません。');
  return p;
}

export async function listProjects(db: D1Database): Promise<Project[]> {
  const r = await db.prepare(PROJECTS_SQL).all<ProjectRow>();
  return r.results.map(rowToProject);
}

async function nameTaken(db: D1Database, name: string, exceptId: number): Promise<boolean> {
  const r = await db.prepare('SELECT id FROM projects WHERE name = ? AND id != ?').bind(name, exceptId).first();
  return r !== null;
}

export async function addProject(db: D1Database, name: unknown): Promise<number> {
  const p = assertProjectName(name);
  if (await nameTaken(db, p, 0)) throw new AppError('同名のプロジェクトが既にあります: ' + p, 409);
  const r = await db
    .prepare('INSERT INTO projects (name, sort_order) VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM projects)) RETURNING id')
    .bind(p)
    .first<{ id: number }>();
  return Number(r?.id ?? 0);
}

/** 渡した項目だけ更新する (COALESCE)。改名は cites が project_id で結ばれているので全エントリへ反映される。 */
export async function updateProject(
  db: D1Database, id: number, patch: { name?: unknown; note?: unknown; archived?: unknown },
): Promise<void> {
  const name = patch.name === undefined ? null : assertProjectName(patch.name);
  if (patch.note !== undefined && typeof patch.note !== 'string') throw new AppError('リクエスト本文が不正です。');
  const note = patch.note === undefined ? null : patch.note;
  const archived = optBool(patch.archived);
  if (name !== null && (await nameTaken(db, name, id))) {
    throw new AppError('同名のプロジェクトが既にあります: ' + name, 409);
  }
  const r = await db
    .prepare('UPDATE projects SET name = COALESCE(?, name), note = COALESCE(?, note), archived = COALESCE(?, archived) WHERE id = ?')
    .bind(name, note, archived === undefined ? null : archived ? 1 : 0, id)
    .run();
  if (r.meta.changes === 0) throw notFound('プロジェクト');
}

/** プロジェクト削除。該当 cites は ON DELETE CASCADE で消える。 */
export async function deleteProject(db: D1Database, id: number): Promise<void> {
  const r = await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
  if (r.meta.changes === 0) throw notFound('プロジェクト');
}

/** サイドバーの並び順を保存する。ids は現在の全プロジェクト id を並べ替えた配列であること。 */
export async function reorderProjects(db: D1Database, ids: unknown): Promise<void> {
  const next = idList(ids);
  const current = (await db.prepare('SELECT id FROM projects').all<{ id: number }>()).results.map((r) => r.id);
  if (!sameIdSet(next, current)) {
    throw new AppError('プロジェクト一覧が変更されています。再読み込みしてやり直してください。', 409);
  }
  if (!next.length) return;
  await db.batch(next.map((id, i) => db.prepare('UPDATE projects SET sort_order = ? WHERE id = ?').bind(i, id)));
}

export async function assertProjectExists(db: D1Database, id: number): Promise<void> {
  const r = await db.prepare('SELECT id FROM projects WHERE id = ?').bind(id).first();
  if (!r) throw notFound('プロジェクト');
}

/** 所属を追加・変更する文。新規または state が変わる場合は移動先の列の末尾
 * (列内の MAX(position) + 1、空の列なら 0) に置く。state が同じなら position と memo を保つ。
 * SQLite の UPDATE では SET の右辺はすべて更新前の値で評価される。 */
export function citeUpsertStatement(
  db: D1Database, entryId: number, projectId: number, state: CiteState,
): D1PreparedStatement {
  return db
    .prepare(
      'INSERT INTO cites (entry_id, project_id, state, position) ' +
        'VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM cites WHERE project_id = ? AND state = ?)) ' +
        'ON CONFLICT(entry_id, project_id) DO UPDATE SET ' +
        'position = CASE WHEN cites.state = excluded.state THEN cites.position ELSE excluded.position END, ' +
        'state = excluded.state',
    )
    .bind(entryId, projectId, state, projectId, state);
}

/** カンバン 1 列の並び順を保存する。entryIds はその列の全 entry id を並べ替えた配列であること。 */
export async function reorderColumn(db: D1Database, projectId: number, state: string, entryIds: unknown): Promise<void> {
  const s = parseCiteState(state);
  await assertProjectExists(db, projectId);
  const next = idList(entryIds);
  const current = (
    await db
      .prepare('SELECT entry_id FROM cites WHERE project_id = ? AND state = ?')
      .bind(projectId, s)
      .all<{ entry_id: number }>()
  ).results.map((r) => r.entry_id);
  if (!sameIdSet(next, current)) {
    throw new AppError('列の内容が変更されています。再読み込みしてやり直してください。', 409);
  }
  if (!next.length) return;
  await db.batch(
    next.map((entryId, i) =>
      db
        .prepare('UPDATE cites SET position = ? WHERE project_id = ? AND entry_id = ? AND state = ?')
        .bind(i, projectId, entryId, s),
    ),
  );
}

/** プロジェクト内の 1 件の state / memo を変える。state が変わる場合は移動先の列の末尾へ置く。 */
export async function updateProjectEntry(
  db: D1Database, projectId: number, entryId: number, patch: { state?: unknown; memo?: unknown },
): Promise<void> {
  const state = patch.state === undefined ? null : parseCiteState(patch.state);
  if (patch.memo !== undefined && typeof patch.memo !== 'string') throw new AppError('リクエスト本文が不正です。');
  await assertProjectExists(db, projectId);
  const cur = await db
    .prepare('SELECT state FROM cites WHERE project_id = ? AND entry_id = ?')
    .bind(projectId, entryId)
    .first<{ state: string }>();
  if (!cur) throw notFound('エントリ');
  const stmts: D1PreparedStatement[] = [];
  if (state !== null && state !== cur.state) stmts.push(citeUpsertStatement(db, entryId, projectId, state));
  if (typeof patch.memo === 'string') {
    stmts.push(
      db.prepare('UPDATE cites SET memo = ? WHERE project_id = ? AND entry_id = ?').bind(patch.memo, projectId, entryId),
    );
  }
  if (stmts.length) await db.batch(stmts);
}
