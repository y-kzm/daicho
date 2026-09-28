import type { CiteInfo, Entry, EntryInput, Priority } from '../../shared/types';
import { AppError, notFound } from '../errors';
import { assertBulkSize } from '../validate';
import { entryUpdateStatement, getEntriesByIds } from './entries';
import { ensureTagStatements, entryTagStatements } from './tags';

type FillKey =
  | 'summary' | 'url' | 'doi' | 'year' | 'country' | 'publisher' | 'journal' | 'impactFactor' | 'conference' | 'core' | 'docStatus';

/** 仕様 §4 の統合規則で keep に removed を畳み込んだ結果を返す。引数は変更しない。 */
export function mergeEntries(
  keep: Entry, removed: Entry[],
): { input: EntryInput; starred: boolean; priority: Priority; cites: Record<string, CiteInfo> } {
  const tags = [...keep.tags];
  for (const r of removed) {
    for (const t of r.tags) if (!tags.includes(t)) tags.push(t);
  }
  const cites: Record<string, CiteInfo> = {};
  for (const [pid, info] of Object.entries(keep.cites)) cites[pid] = { ...info };
  for (const r of removed) {
    for (const [pid, info] of Object.entries(r.cites)) if (!(pid in cites)) cites[pid] = { ...info };
  }
  // フォーム項目は keep が空 (trim 後) のときだけ removed の先頭の非空値で埋める
  const fill = (k: FillKey): string => [keep, ...removed].map((e) => e[k]).find((v) => v.trim() !== '') ?? keep[k];
  const note = [keep, ...removed].map((e) => e.note).filter((n) => n.trim() !== '').join('\n\n');
  const input: EntryInput = {
    tags,
    title: keep.title,
    summary: fill('summary'),
    url: fill('url'),
    doi: fill('doi'),
    year: fill('year'),
    country: fill('country'),
    publisher: fill('publisher'),
    journal: fill('journal'),
    impactFactor: fill('impactFactor'),
    conference: fill('conference'),
    core: fill('core'),
    bibkey: keep.bibkey,
    read: keep.read,
    note,
    // 残す側が論文で、相手が RFC などの場合は、相手の種類を引き継ぐ (状態だけが残るのを防ぐ)
    kind: keep.kind !== 'paper' ? keep.kind : removed.find((r) => r.kind !== 'paper')?.kind ?? 'paper',
    docStatus: fill('docStatus'),
  };
  const starred = keep.starred || removed.some((r) => r.starred);
  const priority = Math.max(keep.priority, ...removed.map((r) => r.priority)) as Priority;
  return { input, starred, priority, cites };
}

/** removeIds を keepId に統合し、removeIds の行を削除する。全体を 1 回の batch で書く。 */
export async function applyMerge(db: D1Database, keepId: number, removeIds: number[]): Promise<void> {
  const rm = Array.from(new Set(removeIds)).filter((id) => id !== keepId);
  if (!rm.length) throw new AppError('マージする対象がありません。');
  assertBulkSize(rm.length);
  const found = await getEntriesByIds(db, [keepId, ...rm]);
  const keep = found.find((e) => e.id === keepId);
  const removed = rm.map((id) => found.find((e) => e.id === id)).filter((e): e is Entry => e !== undefined);
  if (!keep || removed.length !== rm.length) throw notFound('エントリ');
  const m = mergeEntries(keep, removed);
  await db.batch([
    // 付けてある PDF は残す側へ移す (論文の削除に連動して消えないよう、削除より先に行う)
    db
      .prepare('UPDATE attachments SET entry_id = ? WHERE entry_id IN (SELECT value FROM json_each(?))')
      .bind(keepId, JSON.stringify(rm)),
    ...rm.map((id) => db.prepare('DELETE FROM entries WHERE id = ?').bind(id)),
    entryUpdateStatement(db, keepId, m.input),
    db.prepare('UPDATE entries SET starred = ?, priority = ? WHERE id = ?').bind(m.starred ? 1 : 0, m.priority, keepId),
    ...ensureTagStatements(db, m.input.tags),
    ...entryTagStatements(db, keepId, m.input.tags),
    db.prepare('DELETE FROM cites WHERE entry_id = ?').bind(keepId),
    ...Object.entries(m.cites).map(([pid, c]) =>
      db
        .prepare('INSERT INTO cites (entry_id, project_id, state, position, memo) VALUES (?, ?, ?, ?, ?)')
        .bind(keepId, Number(pid), c.state, c.position, c.memo),
    ),
  ]);
}
