import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { clearDriveAuth, getDriveAuth, saveDriveAuth } from '../db/drive-auth';
import type { Env } from '../env';
import { AUTH_URL, DRIVE_SCOPE, exchangeCode, revoke } from '../services/drive';
import { oauthClient, requireClient } from '../services/drive-session';
import type { DriveStatus } from '../../shared/types';

const drive = new Hono<{ Bindings: Env }>();

const STATE_COOKIE = 'daicho_drive_state';
const STATE_TTL_SECONDS = 600;
const CALLBACK_PATH = '/api/drive/callback';

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 長さの違いと内容の違いで処理時間が変わらないように比べる */
function sameState(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const redirectUri = (url: string): string => new URL(url).origin + CALLBACK_PATH;
/** 結果は画面側で通知として表示する (トークンや詳細な理由は URL に載せない) */
const back = (url: string, result: 'connected' | 'denied' | 'error'): string => `${new URL(url).origin}/?drive=${result}`;

drive.get('/status', async (c) => {
  const status: DriveStatus = {
    configured: oauthClient(c.env) !== null,
    connected: (await getDriveAuth(c.env.DB)) !== null,
  };
  return c.json(status);
});

// 画面の「Google Drive に接続」から開く。Google の同意画面へ移動する
drive.get('/connect', (c) => {
  const client = requireClient(c.env);
  const state = randomState();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true, secure: true, sameSite: 'Lax', path: '/api/drive', maxAge: STATE_TTL_SECONDS,
  });
  const q = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri(c.req.url),
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    // 毎回同意を求める (同意済みだと refresh token が返らないため)
    prompt: 'consent',
    state,
  });
  return c.redirect(`${AUTH_URL}?${q.toString()}`, 302);
});

drive.get('/callback', async (c) => {
  const expected = getCookie(c, STATE_COOKIE) ?? '';
  deleteCookie(c, STATE_COOKIE, { path: '/api/drive' });
  if (!sameState(expected, c.req.query('state') ?? '')) return c.redirect(back(c.req.url, 'error'), 302);
  const code = c.req.query('code') ?? '';
  if (!code) return c.redirect(back(c.req.url, c.req.query('error') ? 'denied' : 'error'), 302);
  try {
    const token = await exchangeCode(requireClient(c.env), code, redirectUri(c.req.url));
    await saveDriveAuth(c.env.DB, token, new Date().toISOString());
  } catch (err) {
    console.error('drive callback failed', err instanceof Error ? err.message : '');
    return c.redirect(back(c.req.url, 'error'), 302);
  }
  return c.redirect(back(c.req.url, 'connected'), 302);
});

// 接続を外す。Drive 上のファイルと、論文に付けた URL は残す
drive.post('/disconnect', async (c) => {
  const saved = await getDriveAuth(c.env.DB);
  if (saved) {
    await revoke(saved.refreshToken);
    await clearDriveAuth(c.env.DB);
  }
  return c.json({});
});

export default drive;
