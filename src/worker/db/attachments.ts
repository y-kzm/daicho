import type { Attachment, AttachmentKind } from '../../shared/types';
import { ATTACHMENTS_MAX } from '../../shared/types';
import { AppError, notFound } from '../errors';

export interface AttachmentRow {
  id: number;
  entry_id: number;
  kind: string;
  file_id: string;
  name: string;
  url: string;
  size: number;
  added_at: string;
}

export const ATTACHMENTS_SQL = 'SELECT id, entry_id, kind, file_id, name, url, size, added_at FROM attachments ORDER BY entry_id, id';

/** Drive の file id は API の応答に含めない (画面は url だけを使う) */
export function rowToAttachment(r: AttachmentRow): Attachment {
  return { id: r.id, kind: r.kind as AttachmentKind, name: r.name, url: r.url, size: r.size, addedAt: r.added_at };
}

export async function listForEntry(db: D1Database, entryId: number): Promise<AttachmentRow[]> {
  const r = await db
    .prepare('SELECT id, entry_id, kind, file_id, name, url, size, added_at FROM attachments WHERE entry_id = ? ORDER BY id')
    .bind(entryId)
    .all<AttachmentRow>();
  return r.results;
}

export async function assertRoom(db: D1Database, entryId: number): Promise<AttachmentRow[]> {
  const rows = await listForEntry(db, entryId);
  if (rows.length >= ATTACHMENTS_MAX) throw new AppError(`1 つの論文に付けられる PDF は ${ATTACHMENTS_MAX} 件までです。`);
  return rows;
}

export interface NewAttachment {
  entryId: number;
  kind: AttachmentKind;
  fileId: string;
  name: string;
  url: string;
  size: number;
}

export async function insertAttachment(db: D1Database, a: NewAttachment, now: string): Promise<number> {
  const exists = await db.prepare('SELECT id FROM attachments WHERE file_id = ?').bind(a.fileId).first();
  if (exists) throw new AppError('このファイルは既に登録されています。', 409);
  const r = await db
    .prepare('INSERT INTO attachments (entry_id, kind, file_id, name, url, size, added_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(a.entryId, a.kind, a.fileId, a.name, a.url, a.size, now)
    .first<{ id: number }>();
  if (!r) throw new AppError('PDF を登録できませんでした。', 500);
  return r.id;
}

export async function getAttachment(db: D1Database, id: number): Promise<AttachmentRow> {
  const r = await db
    .prepare('SELECT id, entry_id, kind, file_id, name, url, size, added_at FROM attachments WHERE id = ?')
    .bind(id)
    .first<AttachmentRow>();
  if (!r) throw notFound('PDF');
  return r;
}

export async function deleteAttachment(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM attachments WHERE id = ?').bind(id).run();
}

/** 論文を削除する前に、Drive 側も片付けるための file id を集める */
export async function fileIdsForEntries(db: D1Database, entryIds: number[]): Promise<string[]> {
  if (!entryIds.length) return [];
  const r = await db
    .prepare('SELECT file_id FROM attachments WHERE entry_id IN (SELECT value FROM json_each(?)) ORDER BY id')
    .bind(JSON.stringify(entryIds))
    .all<{ file_id: string }>();
  return r.results.map((x) => x.file_id);
}
