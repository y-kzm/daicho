import { AppError, notFound } from '../errors';

export function assertTagName(name: unknown): string {
  const t = String(name ?? '').trim();
  if (!t) throw new AppError('タグ名を入力してください。');
  if (/[,、]/.test(t)) throw new AppError('タグ名にカンマは使えません。');
  return t;
}

export async function listTags(db: D1Database): Promise<string[]> {
  const r = await db.prepare('SELECT name FROM tags ORDER BY sort_order, id').all<{ name: string }>();
  return r.results.map((x) => x.name);
}

/** 未登録のタグを末尾に追加する文 (batch 内で順に実行される前提) */
export function ensureTagStatements(db: D1Database, names: string[]): D1PreparedStatement[] {
  const uniq = Array.from(new Set(names.map((n) => String(n).trim()).filter(Boolean)));
  return uniq.map((n) =>
    db
      .prepare('INSERT OR IGNORE INTO tags (name, sort_order) VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tags))')
      .bind(n),
  );
}

/** エントリのタグを names の順で置き換える文 (ensureTagStatements の後に実行すること)。
 * entryId には数値の代わりに { sql } を渡せる。sql は固定の SQL 断片 (ユーザー入力ではない) で、
 * バインドする `?` の代わりに直接埋め込まれる。insertEntry のように、同一 batch 内でまだ
 * 確定していない自動採番 id を `(SELECT seq FROM sqlite_sequence WHERE name = 'entries')` として
 * 参照するために使う。 */
export function entryTagStatements(
  db: D1Database, entryId: number | { sql: string }, names: string[],
): D1PreparedStatement[] {
  const uniq = Array.from(new Set(names.map((n) => String(n).trim()).filter(Boolean)));
  const idSql = typeof entryId === 'number' ? '?' : entryId.sql;
  const bindId = (stmt: D1PreparedStatement, extra: unknown[]): D1PreparedStatement =>
    typeof entryId === 'number' ? stmt.bind(entryId, ...extra) : stmt.bind(...extra);
  const stmts = [bindId(db.prepare(`DELETE FROM entry_tags WHERE entry_id = ${idSql}`), [])];
  uniq.forEach((n, i) => {
    stmts.push(
      bindId(
        db.prepare(`INSERT INTO entry_tags (entry_id, tag_id, position) VALUES (${idSql}, (SELECT id FROM tags WHERE name = ?), ?)`),
        [n, i],
      ),
    );
  });
  return stmts;
}

export async function addTag(db: D1Database, name: unknown): Promise<void> {
  const t = assertTagName(name);
  const exists = await db.prepare('SELECT id FROM tags WHERE name = ?').bind(t).first();
  if (exists) throw new AppError('同名のタグが既にあります: ' + t, 409);
  await db.batch(ensureTagStatements(db, [t]));
}

/** タグ名変更。entry_tags は tag_id で結んでいるので自動的に全エントリへ反映される。 */
export async function renameTag(db: D1Database, oldName: unknown, newName: unknown): Promise<void> {
  const from = assertTagName(oldName);
  const to = assertTagName(newName);
  if (from === to) return;
  const dup = await db.prepare('SELECT id FROM tags WHERE name = ?').bind(to).first();
  if (dup) throw new AppError('同名のタグが既にあります: ' + to, 409);
  const r = await db.prepare('UPDATE tags SET name = ? WHERE name = ?').bind(to, from).run();
  if (r.meta.changes === 0) throw notFound('タグ');
}

export async function deleteTag(db: D1Database, name: unknown): Promise<void> {
  const t = assertTagName(name);
  const r = await db.prepare('DELETE FROM tags WHERE name = ?').bind(t).run();
  if (r.meta.changes === 0) throw notFound('タグ');
}

/** タグの並び順を保存する。order は現在の全タグを並べ替えた配列であること。 */
export async function reorderTags(db: D1Database, order: unknown): Promise<void> {
  const next = (Array.isArray(order) ? order : []).map((t) => String(t).trim()).filter(Boolean);
  const current = await listTags(db);
  const same = next.length === current.length && [...next].sort().join('|') === [...current].sort().join('|');
  if (!same) throw new AppError('タグ一覧が変更されています。再読み込みしてやり直してください。', 409);
  await db.batch(next.map((n, i) => db.prepare('UPDATE tags SET sort_order = ? WHERE name = ?').bind(i, n)));
}
