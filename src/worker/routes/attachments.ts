import { Hono } from 'hono';
import { ATTACHMENT_KINDS, PDF_MAX_BYTES, type AttachmentKind, type UploadSession } from '../../shared/types';
import { getAppData } from '../db/app-data';
import { assertRoom, deleteAttachment, getAttachment, insertAttachment } from '../db/attachments';
import { getEntry } from '../db/entries';
import type { Env } from '../env';
import { AppError, notFound } from '../errors';
import { getFile, PDF_MIME, startUpload, trashFile } from '../services/drive';
import { openDrive } from '../services/drive-session';
import { attachmentName } from '../services/filename';
import { parseIdParam, positiveInt, str } from '../validate';
import { jsonBody } from './context';

const attachments = new Hono<{ Bindings: Env }>();

const FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const SIZE_MESSAGE = `PDF は ${PDF_MAX_BYTES / 1024 / 1024} MB までです。`;

function parseKind(v: unknown): AttachmentKind {
  const s = str(v);
  if (!(ATTACHMENT_KINDS as readonly string[]).includes(s)) throw new AppError('PDF の種類が不正です。');
  return s as AttachmentKind;
}

function parseSize(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) throw new AppError('ファイルの大きさが不正です。');
  if (v > PDF_MAX_BYTES) throw new AppError(SIZE_MESSAGE);
  return v;
}

async function requireEntry(db: D1Database, id: number) {
  const e = await getEntry(db, id);
  if (!e) throw notFound('エントリ');
  return e;
}

// 1. 送信先を作る。ファイル名はここで決める (ブラウザが送ってきた名前は使わない)
attachments.post('/session', async (c) => {
  const body = await jsonBody(c);
  const entry = await requireEntry(c.env.DB, positiveInt(body.entryId));
  const kind = parseKind(body.kind);
  const size = parseSize(body.size);
  if (str(body.mimeType) !== PDF_MIME) throw new AppError('PDF ファイルを選んでください。');
  const existing = await assertRoom(c.env.DB, entry.id);
  const name = attachmentName(entry, kind, existing.map((a) => a.name));
  const { token, folderId } = await openDrive(c.env);
  const origin = c.req.header('origin') || new URL(c.req.url).origin;
  const session: UploadSession = { uploadUrl: await startUpload(token, { name, folderId, size }, origin), name };
  return c.json(session);
});

// 2. 送信が終わったファイルを論文に付ける。Drive に問い合わせて、Daicho のフォルダにある PDF だけを受け付ける
attachments.post('/', async (c) => {
  const body = await jsonBody(c);
  const entry = await requireEntry(c.env.DB, positiveInt(body.entryId));
  const kind = parseKind(body.kind);
  const fileId = str(body.fileId);
  if (!FILE_ID.test(fileId)) throw new AppError('ファイルの指定が不正です。');
  await assertRoom(c.env.DB, entry.id);
  const { token, folderId } = await openDrive(c.env);
  const file = await getFile(token, fileId);
  if (!file || file.trashed || !file.parents.includes(folderId)) throw new AppError('アップロードしたファイルが見つかりません。', 404);
  if (file.mimeType !== PDF_MIME || file.size > PDF_MAX_BYTES) {
    await trashFile(token, fileId).catch(() => false);
    throw new AppError(file.mimeType !== PDF_MIME ? 'PDF ファイルを選んでください。' : SIZE_MESSAGE);
  }
  const url = file.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
  await insertAttachment(c.env.DB, { entryId: entry.id, kind, fileId, name: file.name, url, size: file.size }, new Date().toISOString());
  return c.json(await getAppData(c.env.DB));
});

// Drive のゴミ箱へ移してから、論文から外す。Drive に接続できない場合は外さない (ファイルだけが残るのを防ぐ)
attachments.delete('/:id', async (c) => {
  const row = await getAttachment(c.env.DB, parseIdParam(c.req.param('id')));
  const { token } = await openDrive(c.env);
  if (!(await trashFile(token, row.file_id))) throw new AppError('Google Drive のファイルを削除できませんでした。', 502);
  await deleteAttachment(c.env.DB, row.id);
  return c.json(await getAppData(c.env.DB));
});

export default attachments;
