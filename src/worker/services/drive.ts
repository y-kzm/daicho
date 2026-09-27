import { AppError } from '../errors';

/** Daicho が作ったファイルだけを扱える権限 (Drive の他のファイルは読めない) */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const PDF_MIME = 'application/pdf';
export const FOLDER_NAME = 'Daicho';
const TIMEOUT_MS = 20000;

/** 接続が切れている (トークンが取り消された・期限切れ)。画面は再接続を案内する */
export const RECONNECT_MESSAGE = 'Google Drive との接続が切れています。接続し直してください。';
const DRIVE_ERROR = 'Google Drive と通信できませんでした。時間をおいてやり直してください。';

export interface OAuthClient { clientId: string; clientSecret: string }

export interface DriveFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  parents: string[];
  trashed: boolean;
  webViewLink: string;
}

async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new AppError(DRIVE_ERROR, 502);
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const v: unknown = await res.json();
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const form = (params: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(params).toString(),
});

const auth = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

/** 認可コードを refresh token に交換する。refresh token が無い応答は失敗として扱う */
export async function exchangeCode(client: OAuthClient, code: string, redirectUri: string): Promise<string> {
  const res = await request(TOKEN_URL, form({
    code, client_id: client.clientId, client_secret: client.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code',
  }));
  const body = await readJson(res);
  const token = typeof body.refresh_token === 'string' ? body.refresh_token : '';
  // 同意画面で Drive の許可を外した場合は、接続済みにしない (保存のたびに失敗するため)
  const granted = typeof body.scope === 'string' ? body.scope.split(/\s+/) : [];
  if (!res.ok || !token || !granted.includes(DRIVE_SCOPE)) {
    if (token) await revoke(token);
    throw new AppError('Google Drive に接続できませんでした。もう一度やり直してください。', 502);
  }
  return token;
}

export async function accessToken(client: OAuthClient, refreshToken: string): Promise<string> {
  const res = await request(TOKEN_URL, form({
    client_id: client.clientId, client_secret: client.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token',
  }));
  const body = await readJson(res);
  if (res.status === 400 || res.status === 401) throw new AppError(RECONNECT_MESSAGE, 409);
  const token = typeof body.access_token === 'string' ? body.access_token : '';
  if (!res.ok || !token) throw new AppError(DRIVE_ERROR, 502);
  return token;
}

/** 取り消しに失敗しても、接続情報は手元から消すので無視する */
export async function revoke(refreshToken: string): Promise<void> {
  try {
    await request('https://oauth2.googleapis.com/revoke', form({ token: refreshToken }));
  } catch {
    // 無視する
  }
}

const FILE_FIELDS = 'id,name,size,mimeType,parents,trashed,webViewLink';

function toFile(b: Record<string, unknown>): DriveFile {
  return {
    id: String(b.id ?? ''),
    name: String(b.name ?? ''),
    size: Number(b.size ?? 0) || 0,
    mimeType: String(b.mimeType ?? ''),
    parents: Array.isArray(b.parents) ? b.parents.map(String) : [],
    trashed: b.trashed === true,
    webViewLink: String(b.webViewLink ?? ''),
  };
}

/** 無い・見えないファイルは null (この権限では、Daicho が作っていないファイルも 404 になる) */
export async function getFile(token: string, fileId: string): Promise<DriveFile | null> {
  const res = await request(`${API}/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`, { headers: auth(token) });
  if (res.status === 404) return null;
  if (res.status === 401) throw new AppError(RECONNECT_MESSAGE, 409);
  if (!res.ok) throw new AppError(DRIVE_ERROR, 502);
  return toFile(await readJson(res));
}

async function createFolder(token: string): Promise<string> {
  const res = await request(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { ...auth(token), 'content-type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  const id = String((await readJson(res)).id ?? '');
  if (!res.ok || !id) throw new AppError(DRIVE_ERROR, 502);
  return id;
}

/** 保存先フォルダ。無い・ゴミ箱にある場合は作り直す。戻り値の created が true なら id を保存し直す */
export async function ensureFolder(token: string, folderId: string): Promise<{ id: string; created: boolean }> {
  if (folderId) {
    const f = await getFile(token, folderId);
    if (f && !f.trashed && f.mimeType === FOLDER_MIME) return { id: folderId, created: false };
  }
  return { id: await createFolder(token), created: true };
}

/**
 * 再開可能アップロードの受付 URL を作る。origin を付けて作ると、その URL はブラウザからの
 * 直接送信 (CORS) を受け付ける。URL 自体が送信の許可になるので、Drive のトークンはブラウザへ渡さない。
 */
export async function startUpload(
  token: string, file: { name: string; folderId: string; size: number }, origin: string,
): Promise<string> {
  const res = await request(`${UPLOAD_API}/files?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: {
      ...auth(token),
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': PDF_MIME,
      'x-upload-content-length': String(file.size),
      origin,
    },
    body: JSON.stringify({ name: file.name, parents: [file.folderId], mimeType: PDF_MIME }),
  });
  const url = res.headers.get('location') ?? '';
  if (res.status === 401) throw new AppError(RECONNECT_MESSAGE, 409);
  if (!res.ok || !url.startsWith('https://')) throw new AppError(DRIVE_ERROR, 502);
  return url;
}

const VIEW_URL = /^https:\/\/(drive|docs)\.google\.com\//;

/** 画面にリンクとして出す URL。Drive が返した値が想定外なら、id から組み立てる */
export function viewUrl(file: { id: string; webViewLink: string }): string {
  return VIEW_URL.test(file.webViewLink) ? file.webViewLink : `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`;
}

/** ゴミ箱へ移す (完全には消さない)。既に無いファイルは成功として扱う */
export async function trashFile(token: string, fileId: string): Promise<boolean> {
  const res = await request(`${API}/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    headers: { ...auth(token), 'content-type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  return res.ok || res.status === 404;
}
