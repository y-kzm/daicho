import type { BulkOp, Entry, EntryInput, EntryProjectInput, Priority } from '../../shared/types';
import { AppError, notFound } from '../errors';
import { assertBulkSize, parseCiteState, parseReadState, str } from '../validate';
import { loadEntries, type EntryRow } from './app-data';
import { assertProjectExists, citeUpsertStatement } from './projects';
import { ensureTagStatements, entryTagStatements } from './tags';

const COLS =
  'title, summary, url, doi, year, country, publisher, journal, impact_factor, conference, core, bibkey, read, note';

function values(e: EntryInput): string[] {
  return [
    e.title, e.summary, e.url, e.doi, e.year, e.country, e.publisher, e.journal,
    e.impactFactor, e.conference, e.core, e.bibkey, e.read || '未読', e.note,
  ];
}

async function assertExists(db: D1Database, id: number): Promise<void> {
  const r = await db.prepare('SELECT id FROM entries WHERE id = ?').bind(id).first();
  if (!r) throw notFound('エントリ');
}

/** 挿入・タグ登録を単一の batch (= 1 トランザクション) として実行する。
 * entry_id には last_insert_rowid() ではなく sqlite_sequence を使う。
 * batch 内の entry_tags 挿入自体が row を書き込むため last_insert_rowid() は使えない。 */
/** projects を渡すと、追加と同じ batch (= 1 トランザクション) で各プロジェクトの列の末尾に入れる。
 * 存在しないプロジェクトが 1 つでもあれば、何も追加せずに 404。 */
export async function insertEntry(
  db: D1Database, input: EntryInput, added: string, projects: EntryProjectInput[] = [],
): Promise<number> {
  for (const p of projects) await assertProjectExists(db, p.projectId);
  const insertStmt = db
    .prepare(`INSERT INTO entries (added, ${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(added, ...values(input));
  const newIdSql = { sql: `(SELECT seq FROM sqlite_sequence WHERE name = 'entries')` };
  await db.batch([
    insertStmt,
    ...ensureTagStatements(db, input.tags),
    ...entryTagStatements(db, newIdSql, input.tags),
    ...projects.map((p) =>
      db
        .prepare(
          'INSERT INTO cites (entry_id, project_id, state, position) ' +
            `VALUES (${newIdSql.sql}, ?1, ?2, ` +
            '(SELECT COALESCE(MAX(position), -1) + 1 FROM cites WHERE project_id = ?1 AND state = ?2))',
        )
        .bind(p.projectId, p.state),
    ),
  ]);
  const row = await db.prepare(`SELECT seq FROM sqlite_sequence WHERE name = 'entries'`).first<{ seq: number }>();
  return Number(row?.seq ?? 0);
}

/** フォーム項目 (EntryInput のタグ以外) を上書きする文。merge.ts からも使う */
export function entryUpdateStatement(db: D1Database, id: number, input: EntryInput): D1PreparedStatement {
  const sets = COLS.split(', ').map((c) => `${c} = ?`).join(', ');
  return db.prepare(`UPDATE entries SET ${sets} WHERE id = ?`).bind(...values(input), id);
}

/** 編集保存。added / cites / starred / priority / last_opened_at は変更しない。 */
export async function updateEntry(db: D1Database, id: number, input: EntryInput): Promise<void> {
  await assertExists(db, id);
  await db.batch([
    entryUpdateStatement(db, id, input),
    ...ensureTagStatements(db, input.tags),
    ...entryTagStatements(db, id, input.tags),
  ]);
}

export async function deleteEntry(db: D1Database, id: number): Promise<void> {
  const r = await db.prepare('DELETE FROM entries WHERE id = ?').bind(id).run();
  if (r.meta.changes === 0) throw notFound('エントリ');
}

export async function getEntry(db: D1Database, id: number): Promise<Entry | null> {
  return (await getEntriesByIds(db, [id]))[0] ?? null;
}

/** id 昇順で返す。存在しない id は無視する。 */
export async function getEntriesByIds(db: D1Database, ids: number[]): Promise<Entry[]> {
  const set = new Set(ids);
  return (await loadEntries(db)).filter((e) => set.has(e.id));
}

export async function setReadState(db: D1Database, id: number, value: string): Promise<void> {
  const state = parseReadState(value);
  const r = await db.prepare('UPDATE entries SET read = ? WHERE id = ?').bind(state, id).run();
  if (r.meta.changes === 0) throw notFound('エントリ');
}

/** プロジェクトへの所属を設定する。state 空 = 所属解除。
 * 新規所属と state 変更は移動先の列の末尾に置く (citeUpsertStatement)。 */
export async function setCiteState(db: D1Database, entryId: number, projectId: number, state: string): Promise<void> {
  const s = str(state);
  const next = s ? parseCiteState(s) : null;
  await assertExists(db, entryId);
  await assertProjectExists(db, projectId);
  if (next === null) {
    await db.prepare('DELETE FROM cites WHERE entry_id = ? AND project_id = ?').bind(entryId, projectId).run();
    return;
  }
  await citeUpsertStatement(db, entryId, projectId, next).run();
}

/** 省略したフラグは現在値のまま (COALESCE) */
export function flagsStatement(
  db: D1Database, id: number, flags: { starred?: boolean; priority?: Priority },
): D1PreparedStatement {
  const starred = flags.starred === undefined ? null : flags.starred ? 1 : 0;
  return db
    .prepare('UPDATE entries SET starred = COALESCE(?, starred), priority = COALESCE(?, priority) WHERE id = ?')
    .bind(starred, flags.priority ?? null, id);
}

export async function setFlags(db: D1Database, id: number, flags: { starred?: boolean; priority?: Priority }): Promise<void> {
  const r = await flagsStatement(db, id, flags).run();
  if (r.meta.changes === 0) throw notFound('エントリ');
}

/** 詳細パネルを開いた時刻 (ISO 8601) を記録する */
export async function touchEntry(db: D1Database, id: number, now: string): Promise<void> {
  const r = await db.prepare('UPDATE entries SET last_opened_at = ? WHERE id = ?').bind(now, id).run();
  if (r.meta.changes === 0) throw notFound('エントリ');
}

const IDS = 'SELECT value FROM json_each(?)';

/** 一括操作の文。id 列は JSON 文字列 1 個として束縛し json_each で展開するので、
 * 文の数は件数 N に依存しない (tags は 2·|add|+1、他は 1〜2)。
 * position は一意かつ移動先の既存最大値より大きければよい (連番化は並べ替え時に行う)。 */
export function bulkStatements(db: D1Database, ids: number[], op: BulkOp): D1PreparedStatement[] {
  const json = JSON.stringify(ids);
  switch (op.type) {
    case 'tags': {
      const add = Array.from(new Set(op.add));
      return [
        ...ensureTagStatements(db, add),
        db
          .prepare(
            `DELETE FROM entry_tags WHERE entry_id IN (${IDS}) ` +
              'AND tag_id IN (SELECT id FROM tags WHERE name IN (SELECT value FROM json_each(?)))',
          )
          .bind(json, JSON.stringify(op.remove)),
        // タグごとに 1 文。batch 内で順に実行されるので各エントリの position は単調に増える
        ...add.map((name) =>
          db
            .prepare(
              'INSERT INTO entry_tags (entry_id, tag_id, position) ' +
                'SELECT e.value, t.id, (SELECT COALESCE(MAX(p.position), -1) + 1 FROM entry_tags p WHERE p.entry_id = e.value) ' +
                'FROM json_each(?) e JOIN tags t ON t.name = ? ' +
                'WHERE NOT EXISTS (SELECT 1 FROM entry_tags x WHERE x.entry_id = e.value AND x.tag_id = t.id)',
            )
            .bind(json, name),
        ),
      ];
    }
    case 'read':
      return [db.prepare(`UPDATE entries SET read = ? WHERE id IN (${IDS})`).bind(op.state, json)];
    case 'flags': {
      const starred = op.starred === undefined ? null : op.starred ? 1 : 0;
      return [
        db
          .prepare(`UPDATE entries SET starred = COALESCE(?, starred), priority = COALESCE(?, priority) WHERE id IN (${IDS})`)
          .bind(starred, op.priority ?? null, json),
      ];
    }
    case 'project': {
      const colEnd = '(SELECT COALESCE(MAX(c.position), -1) + 1 FROM cites c WHERE c.project_id = ?1 AND c.state = ?2)';
      return [
        // 別の列にいる既存メンバー: 移動先の列の末尾より後ろへ (entry_id を足して一意にする)
        db
          .prepare(
            `UPDATE cites SET state = ?2, position = ${colEnd} + entry_id ` +
              'WHERE project_id = ?1 AND state != ?2 AND entry_id IN (SELECT value FROM json_each(?3))',
          )
          .bind(op.projectId, op.state, json),
        // 新規メンバー: 列の末尾から、新規分の中での順位 (ids の順 = id 昇順) で連番に置く
        db
          .prepare(
            'INSERT INTO cites (entry_id, project_id, state, position, memo) ' +
              `SELECT e.value, ?1, ?2, ${colEnd} + ` +
              '(SELECT COUNT(*) FROM json_each(?3) j WHERE j.key < e.key ' +
              'AND NOT EXISTS (SELECT 1 FROM cites y WHERE y.project_id = ?1 AND y.entry_id = j.value)), \'\' ' +
              'FROM json_each(?3) e ' +
              'WHERE NOT EXISTS (SELECT 1 FROM cites x WHERE x.project_id = ?1 AND x.entry_id = e.value)',
          )
          .bind(op.projectId, op.state, json),
      ];
    }
    case 'unproject':
      return [db.prepare(`DELETE FROM cites WHERE project_id = ? AND entry_id IN (${IDS})`).bind(op.projectId, json)];
    case 'delete':
      return [db.prepare(`DELETE FROM entries WHERE id IN (${IDS})`).bind(json)];
  }
}

/** 選択したエントリへ同じ操作を 1 回の batch (= 1 トランザクション) で適用する。
 * 存在しない id は無視し、1 件も無ければ 404。対象は id 昇順で処理する。 */
export async function bulkApply(db: D1Database, ids: number[], op: BulkOp): Promise<void> {
  const uniq = Array.from(new Set(ids));
  assertBulkSize(uniq.length);
  if (!uniq.length) throw new AppError('対象のエントリがありません。');
  const targets = await getEntriesByIds(db, uniq);
  if (!targets.length) throw notFound('エントリ');
  if (op.type === 'project' || op.type === 'unproject') await assertProjectExists(db, op.projectId);
  await db.batch(bulkStatements(db, targets.map((e) => e.id), op));
}

/** 他の行と衝突する場合、末尾に a, b, c... を付けて一意化する */
export async function ensureUniqueBibkey(db: D1Database, key: string, excludeId: number | null): Promise<string> {
  const base = String(key ?? '').trim();
  if (!base) return base;
  const r = await db
    .prepare('SELECT bibkey FROM entries WHERE id != ? AND bibkey != ?')
    .bind(excludeId ?? -1, '')
    .all<{ bibkey: string }>();
  const used = new Set(r.results
    .filter((row) => row.bibkey.startsWith(base))
    .map((x) => x.bibkey));
  if (!used.has(base)) return base;
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
    if (!used.has(base + ch)) return base + ch;
  }
  return base + '_' + Date.now();
}

export async function updateEntryFields(
  db: D1Database,
  id: number,
  fields: Partial<Pick<EntryRow, 'impact_factor' | 'core' | 'country'>>,
): Promise<void> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  await db.prepare(`UPDATE entries SET ${sets} WHERE id = ?`).bind(...keys.map((k) => fields[k] ?? ''), id).run();
}
