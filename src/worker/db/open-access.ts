import type { OpenAccess } from '../../shared/types';
import { notFound } from '../errors';

export function oaStatement(db: D1Database, id: number, oa: OpenAccess): D1PreparedStatement {
  return db
    .prepare('UPDATE entries SET oa_status = ?, oa_url = ?, oa_license = ?, oa_checked_at = ? WHERE id = ?')
    .bind(oa.status, oa.url, oa.license, oa.checkedAt, id);
}

export async function setOpenAccess(db: D1Database, id: number, oa: OpenAccess): Promise<void> {
  const r = await oaStatement(db, id, oa).run();
  if (r.meta.changes === 0) throw notFound('エントリ');
}

/** まだ判定していない、DOI のある論文 (RFC などの文書は除く) */
export async function uncheckedOa(db: D1Database, limit: number): Promise<{ items: { id: number; doi: string }[]; total: number }> {
  const where = "kind = 'paper' AND doi != '' AND oa_checked_at = ''";
  const [rows, count] = await db.batch([
    db.prepare(`SELECT id, doi FROM entries WHERE ${where} ORDER BY id LIMIT ?`).bind(limit),
    db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE ${where}`),
  ]);
  return {
    items: rows!.results as unknown as { id: number; doi: string }[],
    total: Number((count!.results[0] as { n: number } | undefined)?.n ?? 0),
  };
}
