import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AppData, DriveStatus } from '../../src/shared/types';
import { getDriveAuth, saveDriveAuth } from '../../src/worker/db/drive-auth';
import { createApp } from '../../src/worker/index';
import { mockFetchDetailed } from './fetch-mock';
import { call } from './request';

const app = createApp();
const ORIGIN = 'https://daicho.example.test';

async function get(path: string, headers: Record<string, string> = {}, e: unknown = env) {
  return app.request(ORIGIN + path, { method: 'GET', headers }, e as typeof env);
}

/** /connect を開いて、同意画面の URL と state の Cookie を得る */
async function startConnect() {
  const res = await get('/api/drive/connect');
  const location = new URL(res.headers.get('location') ?? '');
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  return { res, location, cookie, state: location.searchParams.get('state') ?? '' };
}

describe('GET /api/drive/status', () => {
  it('reports configuration and connection separately', async () => {
    expect((await call<DriveStatus>('GET', '/api/drive/status')).json).toEqual({ configured: true, connected: false });
    await saveDriveAuth(env.DB, 'rt', '2026-09-28T00:00:00.000Z');
    expect((await call<DriveStatus>('GET', '/api/drive/status')).json).toEqual({ configured: true, connected: true });
  });

  it('is not configured without the client secret', async () => {
    const res = await get('/api/drive/status', {}, { ...env, GOOGLE_CLIENT_SECRET: ' ' });
    expect(await res.json()).toEqual({ configured: false, connected: false });
  });
});

describe('GET /api/drive/connect', () => {
  it('redirects to Google asking only for files created by the app', async () => {
    const { res, location, cookie, state } = await startConnect();
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(location.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
    expect(location.searchParams.get('client_id')).toBe('test-client-id');
    expect(location.searchParams.get('redirect_uri')).toBe(ORIGIN + '/api/drive/callback');
    expect(location.searchParams.get('access_type')).toBe('offline');
    expect(location.search).not.toContain('test-client-secret');
    expect(state).toMatch(/^[0-9a-f]{48}$/);
    expect(cookie).toBe('daicho_drive_state=' + state);
    const attrs = (res.headers.get('set-cookie') ?? '').toLowerCase();
    expect(attrs).toContain('httponly');
    expect(attrs).toContain('secure');
    expect(attrs).toContain('samesite=lax');
  });

  it('uses a new state every time', async () => {
    expect((await startConnect()).state).not.toBe((await startConnect()).state);
  });

  it('503 when the client is not configured', async () => {
    const res = await get('/api/drive/connect', {}, { ...env, GOOGLE_CLIENT_ID: '' });
    expect(res.status).toBe(503);
  });
});

describe('GET /api/drive/callback', () => {
  it('stores the refresh token and never puts it in the redirect', async () => {
    const { cookie, state } = await startConnect();
    const calls = mockFetchDetailed([{ match: 'oauth2.googleapis.com/token', body: { refresh_token: 'rt-secret', access_token: 'at' } }]);
    const res = await get(`/api/drive/callback?code=abc&state=${state}`, { cookie });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(ORIGIN + '/?drive=connected');
    expect(await getDriveAuth(env.DB)).toEqual({ refreshToken: 'rt-secret', folderId: '' });
    const sent = new URLSearchParams(calls[0]!.body);
    expect(sent.get('code')).toBe('abc');
    expect(sent.get('grant_type')).toBe('authorization_code');
    expect(sent.get('redirect_uri')).toBe(ORIGIN + '/api/drive/callback');
  });

  it('rejects a missing, wrong or reused state without calling Google', async () => {
    const { cookie, state } = await startConnect();
    const calls = mockFetchDetailed([{ match: /.*/, body: { refresh_token: 'rt' } }]);
    for (const [query, headers] of [
      [`code=abc&state=${state}`, {}],
      ['code=abc&state=' + 'f'.repeat(48), { cookie }],
      ['code=abc', { cookie }],
      ['code=abc&state=', { cookie: 'daicho_drive_state=' }],
    ] as [string, Record<string, string>][]) {
      const res = await get('/api/drive/callback?' + query, headers);
      expect(res.headers.get('location'), query).toBe(ORIGIN + '/?drive=error');
    }
    expect(calls).toHaveLength(0);
    expect(await getDriveAuth(env.DB)).toBeNull();
  });

  it('reports a refusal, and a response without a refresh token, as failures', async () => {
    let c = await startConnect();
    const denied = await get(`/api/drive/callback?error=access_denied&state=${c.state}`, { cookie: c.cookie });
    expect(denied.headers.get('location')).toBe(ORIGIN + '/?drive=denied');
    c = await startConnect();
    mockFetchDetailed([{ match: 'oauth2.googleapis.com/token', body: { access_token: 'at' } }]);
    const res = await get(`/api/drive/callback?code=abc&state=${c.state}`, { cookie: c.cookie });
    expect(res.headers.get('location')).toBe(ORIGIN + '/?drive=error');
    expect(await getDriveAuth(env.DB)).toBeNull();
  });

  it('forgets the folder when connecting again', async () => {
    await saveDriveAuth(env.DB, 'old', '2026-01-01T00:00:00.000Z');
    await env.DB.prepare("UPDATE drive_auth SET folder_id = 'old-folder'").run();
    const { cookie, state } = await startConnect();
    mockFetchDetailed([{ match: 'oauth2.googleapis.com/token', body: { refresh_token: 'new' } }]);
    await get(`/api/drive/callback?code=abc&state=${state}`, { cookie });
    expect(await getDriveAuth(env.DB)).toEqual({ refreshToken: 'new', folderId: '' });
  });
});

describe('POST /api/drive/disconnect', () => {
  it('revokes the token and removes the connection', async () => {
    await saveDriveAuth(env.DB, 'rt', '2026-09-28T00:00:00.000Z');
    const calls = mockFetchDetailed([{ match: 'oauth2.googleapis.com/revoke', body: {} }]);
    expect((await call('POST', '/api/drive/disconnect')).status).toBe(200);
    expect(new URLSearchParams(calls[0]!.body).get('token')).toBe('rt');
    expect(await getDriveAuth(env.DB)).toBeNull();
  });

  it('still disconnects when Google refuses the revocation', async () => {
    await saveDriveAuth(env.DB, 'rt', '2026-09-28T00:00:00.000Z');
    mockFetchDetailed([{ match: 'oauth2.googleapis.com/revoke', status: 400, body: {} }]);
    expect((await call('POST', '/api/drive/disconnect')).status).toBe(200);
    expect(await getDriveAuth(env.DB)).toBeNull();
  });
});

describe('the refresh token stays on the server', () => {
  it('is absent from app data and from the export', async () => {
    await saveDriveAuth(env.DB, 'rt-secret', '2026-09-28T00:00:00.000Z');
    const data = await call<AppData>('GET', '/api/data');
    expect(JSON.stringify(data.json)).not.toContain('rt-secret');
    const exported = await app.request('/api/export?format=json', {}, env);
    expect(await exported.text()).not.toContain('rt-secret');
  });
});
