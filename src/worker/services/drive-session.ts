import { getDriveAuth, saveDriveFolder } from '../db/drive-auth';
import type { Env } from '../env';
import { AppError } from '../errors';
import { accessToken, ensureFolder, trashFile, type OAuthClient } from './drive';

/** 1 回のリクエストで Drive へ送る削除の上限 (無料プランの外部リクエスト上限 50 に収める) */
export const TRASH_MAX = 40;

export function oauthClient(env: Env): OAuthClient | null {
  const clientId = (env.GOOGLE_CLIENT_ID ?? '').trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET ?? '').trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function requireClient(env: Env): OAuthClient {
  const c = oauthClient(env);
  if (!c) throw new AppError('Google Drive の設定がありません。GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を登録してください。', 503);
  return c;
}

/** 接続済みなら、アクセストークンと保存先フォルダを返す */
export async function openDrive(env: Env): Promise<{ token: string; folderId: string }> {
  const client = requireClient(env);
  const saved = await getDriveAuth(env.DB);
  if (!saved) throw new AppError('Google Drive に接続していません。先に接続してください。', 409);
  const token = await accessToken(client, saved.refreshToken);
  const folder = await ensureFolder(token, saved.folderId);
  if (folder.created) await saveDriveFolder(env.DB, folder.id);
  return { token, folderId: folder.id };
}

/**
 * 論文を消したあとの片付け。失敗しても論文の削除は成立させる (Drive に残るだけで、データは壊れない)。
 * 戻り値はゴミ箱へ移せなかった件数。
 */
export async function trashBestEffort(env: Env, fileIds: string[]): Promise<number> {
  if (!fileIds.length) return 0;
  const client = oauthClient(env);
  const saved = client ? await getDriveAuth(env.DB) : null;
  if (!client || !saved) return fileIds.length;
  let left = fileIds.length;
  try {
    const token = await accessToken(client, saved.refreshToken);
    for (const id of fileIds.slice(0, TRASH_MAX)) {
      if (await trashFile(token, id).catch(() => false)) left--;
    }
  } catch {
    // 接続切れなど。残った分は Drive に残る
  }
  return left;
}
