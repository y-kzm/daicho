import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, UploadSession } from '../../src/shared/types';
import { getDriveAuth, saveDriveAuth } from '../../src/worker/db/drive-auth';
import { createApp } from '../../src/worker/index';
import { mockFetchDetailed, type Route } from './fetch-mock';
import { seedEntry } from './helpers';
import { call, type ErrorBody } from './request';

const app = createApp();
const FOLDER = 'folder-0123456789';
const FILE = 'file-0123456789abc';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=xyz';
const PDF = 'application/pdf';

const token: Route = { match: 'oauth2.googleapis.com/token', body: { access_token: 'at-1' } };
const folderOk: Route = { match: `/drive/v3/files/${FOLDER}`, method: 'GET', body: { id: FOLDER, mimeType: 'application/vnd.google-apps.folder', trashed: false } };
const session: Route = { match: '/upload/drive/v3/files', method: 'POST', body: {}, headers: { location: UPLOAD_URL } };
const fileMeta = (over: Record<string, unknown> = {}): Route => ({
  match: `/drive/v3/files/${FILE}`, method: 'GET',
  body: { id: FILE, name: 'key2024 - Paper.pdf', size: '2048', mimeType: PDF, parents: [FOLDER], trashed: false, webViewLink: `https://drive.google.com/file/d/${FILE}/view`, ...over },
});
const trashOk: Route = { match: '/drive/v3/files/', method: 'PATCH', body: {} };

let entryId = 0;

beforeEach(async () => {
  entryId = await seedEntry(env.DB, { title: 'Paper', bibkey: 'key2024' });
  await saveDriveAuth(env.DB, 'rt', '2026-09-28T00:00:00.000Z');
  await env.DB.prepare('UPDATE drive_auth SET folder_id = ?').bind(FOLDER).run();
});

const start = (body: Record<string, unknown>) => call<UploadSession & ErrorBody>('POST', '/api/attachments/session', body);
const register = (body: Record<string, unknown>) => call<AppData & ErrorBody>('POST', '/api/attachments', body);
const entryOf = (d: AppData) => d.entries.find((e) => e.id === entryId)!;

async function seedAttachment(name = 'key2024 - Paper.pdf', fileId = FILE, entry = entryId): Promise<number> {
  const r = await env.DB
    .prepare("INSERT INTO attachments (entry_id, kind, file_id, name, url, size, added_at) VALUES (?, '本文', ?, ?, 'https://drive.google.com/x', 10, '2026-09-28') RETURNING id")
    .bind(entry, fileId, name).first<{ id: number }>();
  return r!.id;
}

describe('POST /api/attachments/session', () => {
  it('names the file on the server and returns only the upload URL', async () => {
    const calls = mockFetchDetailed([token, folderOk, session]);
    const r = await start({ entryId, kind: '本文', size: 2048, mimeType: PDF, name: '../../evil.pdf' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ uploadUrl: UPLOAD_URL, name: 'key2024 - Paper.pdf' });
    expect(JSON.stringify(r.json)).not.toContain('at-1');
    const init = calls.find((c) => c.url.includes('/upload/drive/v3/files'))!;
    expect(JSON.parse(init.body)).toEqual({ name: 'key2024 - Paper.pdf', parents: [FOLDER], mimeType: PDF });
    expect(init.headers.authorization).toBe('Bearer at-1');
    expect(init.headers['x-upload-content-type']).toBe(PDF);
    expect(init.headers['x-upload-content-length']).toBe('2048');
    expect(init.headers.origin).toBeTruthy();
  });

  it('adds the kind and avoids names already used by the entry', async () => {
    await seedAttachment();
    mockFetchDetailed([token, folderOk, session]);
    expect((await start({ entryId, kind: '本文', size: 1, mimeType: PDF })).json.name).toBe('key2024 - Paper (2).pdf');
    expect((await start({ entryId, kind: 'スライド', size: 1, mimeType: PDF })).json.name).toBe('key2024 - Paper (スライド).pdf');
  });

  it('creates the folder when it is missing or in the trash, and remembers it', async () => {
    for (const folder of [{ status: 404, body: {} }, { body: { id: FOLDER, mimeType: 'application/vnd.google-apps.folder', trashed: true } }]) {
      await env.DB.prepare('UPDATE drive_auth SET folder_id = ?').bind(FOLDER).run();
      const calls = mockFetchDetailed([
        token, { match: `/drive/v3/files/${FOLDER}`, method: 'GET', ...folder },
        { match: '/drive/v3/files?fields=id', method: 'POST', body: { id: 'new-folder-000001' } }, session,
      ]);
      expect((await start({ entryId, kind: '本文', size: 1, mimeType: PDF })).status).toBe(200);
      expect((await getDriveAuth(env.DB))!.folderId).toBe('new-folder-000001');
      const create = calls.find((c) => c.method === 'POST' && c.url.includes('/drive/v3/files?fields=id'))!;
      expect(JSON.parse(create.body)).toEqual({ name: 'Daicho', mimeType: 'application/vnd.google-apps.folder' });
      expect(JSON.parse(calls.find((c) => c.url.includes('/upload/'))!.body).parents).toEqual(['new-folder-000001']);
    }
  });

  it('rejects bad input before calling Google', async () => {
    const calls = mockFetchDetailed([token, folderOk, session]);
    const bad: Record<string, unknown>[] = [
      { entryId, kind: '本文', size: 1, mimeType: 'image/png' },
      { entryId, kind: '本文', size: 1 },
      { entryId, kind: 'x', size: 1, mimeType: PDF },
      { entryId, kind: '本文', size: 0, mimeType: PDF },
      { entryId, kind: '本文', size: -5, mimeType: PDF },
      { entryId, kind: '本文', size: 1.5, mimeType: PDF },
      { entryId, kind: '本文', size: '2048', mimeType: PDF },
      { entryId, kind: '本文', size: 100 * 1024 * 1024 + 1, mimeType: PDF },
      { entryId: 'abc', kind: '本文', size: 1, mimeType: PDF },
    ];
    for (const b of bad) expect((await start(b)).status, JSON.stringify(b)).toBe(400);
    expect((await start({ entryId: 9999, kind: '本文', size: 1, mimeType: PDF })).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('stops at ten files per entry', async () => {
    for (let i = 0; i < 10; i++) await seedAttachment(`f${i}.pdf`, `file-000000000${i}`);
    const calls = mockFetchDetailed([token, folderOk, session]);
    const r = await start({ entryId, kind: '本文', size: 1, mimeType: PDF });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain('10 件まで');
    expect(calls).toHaveLength(0);
  });

  it('asks to connect first, and to reconnect when the token was revoked', async () => {
    await env.DB.prepare('DELETE FROM drive_auth').run();
    mockFetchDetailed([token, folderOk, session]);
    expect((await start({ entryId, kind: '本文', size: 1, mimeType: PDF })).status).toBe(409);
    await saveDriveAuth(env.DB, 'rt', '2026-09-28T00:00:00.000Z');
    mockFetchDetailed([{ match: 'oauth2.googleapis.com/token', status: 400, body: { error: 'invalid_grant' } }]);
    const r = await start({ entryId, kind: '本文', size: 1, mimeType: PDF });
    expect(r.status).toBe(409);
    expect(r.json.error).toContain('接続し直して');
  });

  it('502 when Google does not return an upload URL', async () => {
    mockFetchDetailed([token, folderOk, { match: '/upload/drive/v3/files', method: 'POST', body: {} }]);
    expect((await start({ entryId, kind: '本文', size: 1, mimeType: PDF })).status).toBe(502);
  });

  it('503 without the OAuth client', async () => {
    const res = await app.request('/api/attachments/session', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entryId, kind: '本文', size: 1, mimeType: PDF }),
    }, { ...env, GOOGLE_CLIENT_ID: '' });
    expect(res.status).toBe(503);
  });
});

describe('POST /api/attachments', () => {
  it('stores what Drive reports and hides the file id', async () => {
    mockFetchDetailed([token, folderOk, fileMeta()]);
    const r = await register({ entryId, fileId: FILE, kind: '補足資料' });
    expect(r.status).toBe(200);
    expect(entryOf(r.json).attachments).toEqual([{
      id: expect.any(Number), kind: '補足資料', name: 'key2024 - Paper.pdf', size: 2048,
      url: `https://drive.google.com/file/d/${FILE}/view`, addedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    }]);
    expect(Object.keys(entryOf(r.json).attachments[0]!)).not.toContain('fileId');
  });

  it('does not change who can open the file', async () => {
    const calls = mockFetchDetailed([token, folderOk, fileMeta()]);
    await register({ entryId, fileId: FILE, kind: '本文' });
    expect(calls.some((c) => c.url.includes('/permissions'))).toBe(false);
    expect(calls.every((c) => c.method === 'GET' || c.url.includes('oauth2.googleapis.com/token'))).toBe(true);
  });

  it('refuses files outside the Daicho folder, in the trash, or missing', async () => {
    for (const meta of [fileMeta({ parents: ['other-folder'] }), fileMeta({ trashed: true }), { match: `/drive/v3/files/${FILE}`, method: 'GET', status: 404, body: {} }]) {
      mockFetchDetailed([token, folderOk, meta]);
      expect((await register({ entryId, fileId: FILE, kind: '本文' })).status).toBe(404);
    }
    expect(entryOf((await call<AppData>('GET', '/api/data')).json).attachments).toEqual([]);
  });

  it('moves a file that is not a PDF, or too large, to the trash', async () => {
    for (const over of [{ mimeType: 'image/png' }, { size: String(100 * 1024 * 1024 + 1) }]) {
      const calls = mockFetchDetailed([token, folderOk, fileMeta(over), trashOk]);
      expect((await register({ entryId, fileId: FILE, kind: '本文' })).status).toBe(400);
      const patch = calls.find((c) => c.method === 'PATCH')!;
      expect(patch.url).toContain(FILE);
      expect(JSON.parse(patch.body)).toEqual({ trashed: true });
    }
  });

  it('refuses the same file twice, and leaves the registered file alone', async () => {
    const calls = mockFetchDetailed([token, folderOk, fileMeta(), trashOk]);
    expect((await register({ entryId, fileId: FILE, kind: '本文' })).status).toBe(200);
    expect((await register({ entryId, fileId: FILE, kind: '本文' })).status).toBe(409);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('trashes an uploaded file that cannot be attached because the entry is full', async () => {
    for (let i = 0; i < 10; i++) await seedAttachment(`f${i}.pdf`, `file-000000000${i}`);
    const calls = mockFetchDetailed([token, folderOk, fileMeta(), trashOk]);
    expect((await register({ entryId, fileId: FILE, kind: '本文' })).status).toBe(400);
    expect(calls.find((c) => c.method === 'PATCH')!.url).toContain(FILE);
  });

  it('stores only a Google Drive https URL', async () => {
    for (const link of ['javascript:alert(1)', 'http://drive.google.com/x', 'https://evil.example/drive.google.com/', '']) {
      await env.DB.prepare('DELETE FROM attachments').run();
      mockFetchDetailed([token, folderOk, fileMeta({ webViewLink: link })]);
      const r = await register({ entryId, fileId: FILE, kind: '本文' });
      expect(entryOf(r.json).attachments[0]!.url, link).toBe(`https://drive.google.com/file/d/${FILE}/view`);
    }
  });

  it('rejects malformed file ids without calling Google', async () => {
    const calls = mockFetchDetailed([token, folderOk, fileMeta()]);
    for (const fileId of ['', 'short', '../etc/passwd', 'a'.repeat(201), 'has space 0123456', 'id?alt=media&x=1']) {
      expect((await register({ entryId, fileId, kind: '本文' })).status, fileId).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
});

describe('DELETE /api/attachments/:id', () => {
  it('moves the file to the trash, then removes the row', async () => {
    const id = await seedAttachment();
    const calls = mockFetchDetailed([token, folderOk, trashOk]);
    const r = await call<AppData>('DELETE', `/api/attachments/${id}`);
    expect(r.status).toBe(200);
    expect(entryOf(r.json).attachments).toEqual([]);
    expect(calls.find((c) => c.method === 'PATCH')!.url).toContain(FILE);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('also removes the row when the file is already gone', async () => {
    const id = await seedAttachment();
    mockFetchDetailed([token, folderOk, { match: '/drive/v3/files/', method: 'PATCH', status: 404, body: {} }]);
    expect((await call('DELETE', `/api/attachments/${id}`)).status).toBe(200);
  });

  it('keeps the row when Drive fails', async () => {
    const id = await seedAttachment();
    mockFetchDetailed([token, folderOk, { match: '/drive/v3/files/', method: 'PATCH', status: 500, body: {} }]);
    expect((await call('DELETE', `/api/attachments/${id}`)).status).toBe(502);
    expect(entryOf((await call<AppData>('GET', '/api/data')).json).attachments).toHaveLength(1);
  });

  it('404 for unknown ids, 400 for bad ids', async () => {
    mockFetchDetailed([token, folderOk, trashOk]);
    expect((await call('DELETE', '/api/attachments/999')).status).toBe(404);
    expect((await call('DELETE', '/api/attachments/abc')).status).toBe(400);
  });
});

describe('attachments follow their entry', () => {
  it('trashes the files when the entry is deleted', async () => {
    await seedAttachment('a.pdf', 'file-aaaaaaaaaaaa');
    await seedAttachment('b.pdf', 'file-bbbbbbbbbbbb');
    const calls = mockFetchDetailed([token, trashOk]);
    expect((await call('DELETE', `/api/entries/${entryId}`)).status).toBe(200);
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.url.split('/').pop())).toEqual(['file-aaaaaaaaaaaa', 'file-bbbbbbbbbbbb']);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM attachments').first<{ n: number }>())!.n).toBe(0);
  });

  it('still deletes the entry when Drive is unreachable or disconnected', async () => {
    await seedAttachment();
    mockFetchDetailed([{ match: 'oauth2.googleapis.com/token', status: 400, body: { error: 'invalid_grant' } }]);
    expect((await call('DELETE', `/api/entries/${entryId}`)).status).toBe(200);
    const other = await seedEntry(env.DB, { title: 'Other' });
    await seedAttachment('c.pdf', 'file-cccccccccccc', other);
    await env.DB.prepare('DELETE FROM drive_auth').run();
    const calls = mockFetchDetailed([token, trashOk]);
    expect((await call('DELETE', `/api/entries/${other}`)).status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it('reports the files that stayed in Drive', async () => {
    await seedAttachment('a.pdf', 'file-aaaaaaaaaaaa');
    await seedAttachment('b.pdf', 'file-bbbbbbbbbbbb');
    mockFetchDetailed([token, { match: 'file-aaaaaaaaaaaa', method: 'PATCH', body: {} }, { match: 'file-bbbbbbbbbbbb', method: 'PATCH', status: 500, body: {} }]);
    const r = await call<{ driveLeft?: number }>('DELETE', `/api/entries/${entryId}`);
    expect(r.json).toEqual({ driveLeft: 1 });
    const other = await seedEntry(env.DB, { title: 'Other' });
    await seedAttachment('c.pdf', 'file-cccccccccccc', other);
    mockFetchDetailed([token, trashOk]);
    expect((await call('DELETE', `/api/entries/${other}`)).json).toEqual({});
  });

  it('refuses a bulk delete with more files than one request can clean up', async () => {
    const ids: number[] = [];
    for (let e = 0; e < 5; e++) {
      const id = await seedEntry(env.DB, { title: 'Bulk ' + e });
      ids.push(id);
      for (let i = 0; i < 9; i++) await seedAttachment(`b${e}-${i}.pdf`, `file-bulk-${e}-${i}-000`, id);
    }
    let calls = mockFetchDetailed([token, trashOk]);
    const over = await call<ErrorBody>('POST', '/api/entries/bulk', { ids, op: { type: 'delete' } });
    expect(over.status).toBe(400);
    expect(over.json.error).toContain('PDF が 45 件');
    expect(calls).toHaveLength(0);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM attachments').first<{ n: number }>())!.n).toBe(45);
    // 40 件ちょうどは通り、外部への要求は 41 回 (トークン 1 + ゴミ箱 40) に収まる
    calls = mockFetchDetailed([token, trashOk]);
    await env.DB.prepare("DELETE FROM attachments WHERE file_id LIKE 'file-bulk-4-%' AND file_id >= 'file-bulk-4-4'").run();
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM attachments').first<{ n: number }>())!.n).toBe(40);
    const ok = await call<AppData>('POST', '/api/entries/bulk', { ids, op: { type: 'delete' } });
    expect(ok.status).toBe(200);
    expect(ok.json.driveLeft).toBeUndefined();
    expect(calls).toHaveLength(41);
  });

  it('trashes the files on bulk delete, but not on other bulk operations', async () => {
    await seedAttachment();
    let calls = mockFetchDetailed([token, trashOk]);
    await call('POST', '/api/entries/bulk', { ids: [entryId], op: { type: 'read', state: '精読済' } });
    expect(calls).toHaveLength(0);
    calls = mockFetchDetailed([token, trashOk]);
    expect((await call('POST', '/api/entries/bulk', { ids: [entryId], op: { type: 'delete' } })).status).toBe(200);
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
  });

  it('moves to the kept entry on merge, without touching Drive', async () => {
    const other = await seedEntry(env.DB, { title: 'Paper', bibkey: 'dup' });
    await seedAttachment('kept.pdf', 'file-kkkkkkkkkkkk', entryId);
    await seedAttachment('moved.pdf', 'file-mmmmmmmmmmmm', other);
    const calls = mockFetchDetailed([token, trashOk]);
    const r = await call<AppData>('POST', '/api/entries/merge', { keepId: entryId, removeIds: [other] });
    expect(r.status).toBe(200);
    expect(entryOf(r.json).attachments.map((a) => a.name)).toEqual(['kept.pdf', 'moved.pdf']);
    expect(calls).toHaveLength(0);
  });
});
