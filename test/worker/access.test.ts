import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { audiences, resetAccessKeys, teamDomain, verifyAccessJwt } from '../../src/worker/access';
import { createApp } from '../../src/worker/index';

const app = createApp();
const TEAM = 'myteam.cloudflareaccess.com';
const AUD = 'a'.repeat(64);
const NOW = Date.UTC(2026, 8, 28, 0, 0, 0);

const b64 = (bytes: Uint8Array | string): string => {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

interface Signer { kid: string; jwk: JsonWebKey; sign: (header: object, claims: object) => Promise<string> }

async function signer(kid: string): Promise<Signer> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  return {
    kid, jwk: { ...jwk, kid } as JsonWebKey,
    sign: async (header, claims) => {
      const head = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(claims))}`;
      const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(head));
      return `${head}.${b64(new Uint8Array(sig))}`;
    },
  };
}

function serveCerts(keys: JsonWebKey[]): string[] {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    return url === `https://${TEAM}/cdn-cgi/access/certs` ? Response.json({ keys }) : new Response('no', { status: 404 });
  }));
  return calls;
}

const claims = (over: Record<string, unknown> = {}) => ({ aud: [AUD], iss: `https://${TEAM}`, exp: NOW / 1000 + 600, iat: NOW / 1000, ...over });
const head = (kid: string, over: Record<string, unknown> = {}) => ({ alg: 'RS256', kid, typ: 'JWT', ...over });

beforeEach(() => resetAccessKeys());

describe('teamDomain / audiences', () => {
  it('accepts only an Access team domain', () => {
    expect(teamDomain(' MyTeam.cloudflareaccess.com ')).toBe(TEAM);
    expect(teamDomain('https://myteam.cloudflareaccess.com/')).toBe(TEAM);
    for (const v of [undefined, '', 'evil.example', 'myteam.cloudflareaccess.com.evil.example', 'a.b.cloudflareaccess.com', 'myteam.cloudflareaccess.com/x', 'http://myteam.cloudflareaccess.com']) {
      expect(teamDomain(v), String(v)).toBeNull();
    }
  });
  it('reads one or several audiences', () => {
    expect(audiences(`${AUD}, ${'b'.repeat(64)}`)).toEqual([AUD, 'b'.repeat(64)]);
    expect(audiences('not-hex, ,')).toEqual([]);
    expect(audiences(undefined)).toEqual([]);
  });
});

describe('verifyAccessJwt', () => {
  it('accepts a token signed by the team for this application', async () => {
    const s = await signer('k1');
    const calls = serveCerts([s.jwk]);
    expect(await verifyAccessJwt(await s.sign(head('k1'), claims()), TEAM, [AUD], NOW)).toBe(true);
    expect(await verifyAccessJwt(await s.sign(head('k1'), claims({ aud: AUD })), TEAM, [AUD], NOW)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('rejects tokens that are expired, not yet valid, for another application or from another issuer', async () => {
    const s = await signer('k1');
    serveCerts([s.jwk]);
    const bad: Record<string, unknown>[] = [
      { exp: NOW / 1000 - 3600 }, { exp: undefined }, { nbf: NOW / 1000 + 3600 }, { aud: ['b'.repeat(64)] }, { aud: [] }, { aud: undefined },
      { iss: 'https://other.cloudflareaccess.com' }, { iss: undefined },
    ];
    for (const over of bad) expect(await verifyAccessJwt(await s.sign(head('k1'), claims(over)), TEAM, [AUD], NOW), JSON.stringify(over)).toBe(false);
  });

  it('rejects a forged signature, an unknown key and other algorithms', async () => {
    const real = await signer('k1');
    const attacker = await signer('k1');
    serveCerts([real.jwk]);
    expect(await verifyAccessJwt(await attacker.sign(head('k1'), claims()), TEAM, [AUD], NOW)).toBe(false);
    expect(await verifyAccessJwt(await real.sign(head('k9'), claims()), TEAM, [AUD], NOW)).toBe(false);
    const good = await real.sign(head('k1'), claims());
    const [h, p] = good.split('.') as [string, string, string];
    expect(await verifyAccessJwt(`${b64(JSON.stringify(head('k1', { alg: 'none' })))}.${p}.`, TEAM, [AUD], NOW)).toBe(false);
    expect(await verifyAccessJwt(`${b64(JSON.stringify(head('k1', { alg: 'HS256' })))}.${p}.${b64('x')}`, TEAM, [AUD], NOW)).toBe(false);
    const tampered = `${h}.${b64(JSON.stringify(claims({ aud: [AUD], email: 'attacker@example.org' })))}.${good.split('.')[2]}`;
    expect(await verifyAccessJwt(tampered, TEAM, [AUD], NOW)).toBe(false);
    for (const junk of ['', 'x', 'a.b', 'a.b.c.d', '...', 'a b.c.d']) expect(await verifyAccessJwt(junk, TEAM, [AUD], NOW), junk).toBe(false);
  });

  it('fetches the keys again when the team has rotated them', async () => {
    const old = await signer('old');
    const fresh = await signer('new');
    serveCerts([old.jwk]);
    expect(await verifyAccessJwt(await old.sign(head('old'), claims()), TEAM, [AUD], NOW)).toBe(true);
    const calls = serveCerts([fresh.jwk]);
    const token = await fresh.sign(head('new'), claims());
    // 取り直しは間隔を空ける (知らない鍵の番号で、取得を繰り返させない)
    expect(await verifyAccessJwt(token, TEAM, [AUD], NOW + 5_000)).toBe(false);
    expect(calls).toHaveLength(0);
    expect(await verifyAccessJwt(token, TEAM, [AUD], NOW + 31_000)).toBe(true);
    expect(await verifyAccessJwt(await fresh.sign(head('zzz'), claims()), TEAM, [AUD], NOW + 32_000)).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('keeps using the keys it has when they cannot be refreshed', async () => {
    const s = await signer('k1');
    serveCerts([s.jwk]);
    const later = NOW + 2 * 3600_000;
    const token = await s.sign(head('k1'), claims({ exp: later / 1000 + 600 }));
    expect(await verifyAccessJwt(token, TEAM, [AUD], NOW)).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 500 })));
    expect(await verifyAccessJwt(token, TEAM, [AUD], later)).toBe(true);
  });
});

describe('accessGuard on /api', () => {
  const guarded = { ...env, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
  const get = (path: string, headers: Record<string, string>, e: unknown) => app.request('https://d.example' + path, { headers }, e as typeof env);

  it('is off until it is configured', async () => {
    expect((await get('/api/health', {}, env)).status).toBe(200);
  });

  it('lets only verified requests reach the API', async () => {
    const s = await signer('k1');
    serveCerts([s.jwk]);
    const token = await s.sign(head('k1'), claims({ exp: Math.floor(Date.now() / 1000) + 600 }));
    expect((await get('/api/health', { 'cf-access-jwt-assertion': token }, guarded)).status).toBe(200);
    expect((await get('/api/data', { 'cf-access-jwt-assertion': token }, guarded)).status).toBe(200);
    for (const headers of [{}, { 'cf-access-jwt-assertion': 'x' }, { 'cf-access-jwt-assertion': token.slice(0, -4) + 'AAAA' }, { cookie: `CF_Authorization=${token}` }]) {
      const res = await get('/api/data', headers as Record<string, string>, guarded);
      expect(res.status, JSON.stringify(headers).slice(0, 40)).toBe(403);
      expect(JSON.stringify(await res.json())).not.toContain('entries');
    }
  });

  it('also covers writes and the venues API, but not the calendar feed', async () => {
    serveCerts([]);
    const post = await app.request('https://d.example/api/entries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"title":"x"}' }, guarded);
    expect(post.status).toBe(403);
    expect((await get('/api/venues', {}, guarded)).status).toBe(403);
    expect((await get(`/cal/${'a'.repeat(48)}.ics`, {}, guarded)).status).toBe(404);
  });

  it('fails closed when the settings are incomplete or the keys cannot be fetched', async () => {
    for (const e of [{ ...env, ACCESS_TEAM_DOMAIN: TEAM }, { ...env, ACCESS_AUD: AUD }, { ...env, ACCESS_TEAM_DOMAIN: 'evil.example', ACCESS_AUD: AUD }]) {
      expect((await get('/api/data', {}, e)).status).toBe(503);
    }
    const s = await signer('k1');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 500 })));
    const token = await s.sign(head('k1'), claims({ exp: Math.floor(Date.now() / 1000) + 600 }));
    expect((await get('/api/data', { 'cf-access-jwt-assertion': token }, guarded)).status).toBe(503);
  });
});
