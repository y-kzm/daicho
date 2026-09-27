/** Google Drive との接続情報 (1 行だけ)。refresh token はここから外へ出さない */
export interface DriveAuth {
  refreshToken: string;
  folderId: string;
}

export async function getDriveAuth(db: D1Database): Promise<DriveAuth | null> {
  const r = await db
    .prepare('SELECT refresh_token, folder_id FROM drive_auth WHERE id = 1')
    .first<{ refresh_token: string; folder_id: string }>();
  return r ? { refreshToken: r.refresh_token, folderId: r.folder_id } : null;
}

/**
 * 接続し直しても保存先フォルダは覚えておく (同じアカウントなら同じフォルダを使い続ける)。
 * 別のアカウントだった場合、そのフォルダは見えないので、次の保存時に ensureFolder が作り直す。
 */
export async function saveDriveAuth(db: D1Database, refreshToken: string, now: string): Promise<void> {
  await db
    .prepare(
      'INSERT INTO drive_auth (id, refresh_token, folder_id, connected_at) VALUES (1, ?, \'\', ?) ' +
        'ON CONFLICT(id) DO UPDATE SET refresh_token = excluded.refresh_token, connected_at = excluded.connected_at',
    )
    .bind(refreshToken, now)
    .run();
}

export async function saveDriveFolder(db: D1Database, folderId: string): Promise<void> {
  await db.prepare('UPDATE drive_auth SET folder_id = ? WHERE id = 1').bind(folderId).run();
}

export async function clearDriveAuth(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM drive_auth WHERE id = 1').run();
}
