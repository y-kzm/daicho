import type { MiddlewareHandler } from 'hono';
import type { Env } from './env';

/**
 * Cloudflare Access が付ける認証 (JWT) を、Worker の側でも検証する。
 * Access の設定で一部のパスを保護から外しても、/api には認証済みの要求しか通さないための備え。
 * ACCESS_TEAM_DOMAIN と ACCESS_AUD が未設定の場合は検証しない (ローカル開発、設定前の状態)。
 */

const HEADER = 'cf-access-jwt-assertion';
const CERTS_TTL_MS = 60 * 60 * 1000;
const REFETCH_MIN_MS = 30_000;
const CLOCK_SKEW_S = 60;

interface Jwk { kid?: string; kty?: string; n?: string; e?: string; alg?: string }
interface Claims { aud?: string | string[]; exp?: number; nbf?: number; iss?: string }

let cached: { team: string; at: number; keys: Map<string, CryptoKey> } | null = null;

function b64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function json<T>(part: string): T | null {
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(b64url(part)));
    return v && typeof v === 'object' ? (v as T) : null;
  } catch {
    return null;
  }
}

/** チーム名は `<名前>.cloudflareaccess.com` の形だけを受け付ける (鍵の取得先を固定するため) */
export function teamDomain(v: string | undefined): string | null {
  const s = (v ?? '').trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/+$/, '');
  return /^[a-z0-9-]{1,63}\.cloudflareaccess\.com$/.test(s) ? s : null;
}

export function audiences(v: string | undefined): string[] {
  return (v ?? '').split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^[0-9a-f]{32,128}$/i.test(s));
}

async function loadKeys(team: string, now: number, force: boolean): Promise<Map<string, CryptoKey>> {
  const mine = cached && cached.team === team ? cached : null;
  if (mine && !force && now - mine.at < CERTS_TTL_MS) return mine.keys;
  // 知らない鍵の番号を送り続けられても、取り直しは一定の間隔でしか行わない
  if (mine && force && now - mine.at < REFETCH_MIN_MS) return mine.keys;
  let body: { keys?: Jwk[] };
  try {
    const res = await fetch(`https://${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('certs ' + res.status);
    body = (await res.json()) as { keys?: Jwk[] };
  } catch (err) {
    // 取得に失敗しても、手元に鍵があればそれで検証を続ける
    if (mine) return mine.keys;
    throw err;
  }
  const keys = new Map<string, CryptoKey>();
  for (const k of body.keys ?? []) {
    if (!k.kid || k.kty !== 'RSA' || !k.n || !k.e) continue;
    keys.set(k.kid, await crypto.subtle.importKey(
      'jwk', { kty: 'RSA', n: k.n, e: k.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    ));
  }
  cached = { team, at: now, keys };
  return keys;
}

/** テスト用: 鍵のキャッシュを消す */
export function resetAccessKeys(): void {
  cached = null;
}

export async function verifyAccessJwt(token: string, team: string, auds: readonly string[], now = Date.now()): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return false;
  const header = json<{ alg?: string; kid?: string }>(parts[0]!);
  const claims = json<Claims>(parts[1]!);
  // 署名の方式は RS256 だけを受け付ける (none や、共通鍵の方式へのすり替えを拒否する)
  if (!header || header.alg !== 'RS256' || !header.kid || !claims) return false;
  const sec = Math.floor(now / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < sec) return false;
  if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_S > sec) return false;
  if (claims.iss !== `https://${team}`) return false;
  const aud = Array.isArray(claims.aud) ? claims.aud : typeof claims.aud === 'string' ? [claims.aud] : [];
  if (!aud.some((a) => auds.includes(a))) return false;
  let keys = await loadKeys(team, now, false);
  // 鍵が入れ替わった直後は、取り直してもう一度探す
  if (!keys.has(header.kid)) keys = await loadKeys(team, now, true);
  const key = keys.get(header.kid);
  if (!key) return false;
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]!), data);
}

export const accessGuard: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const team = teamDomain(c.env.ACCESS_TEAM_DOMAIN);
  const auds = audiences(c.env.ACCESS_AUD);
  if (!c.env.ACCESS_TEAM_DOMAIN && !c.env.ACCESS_AUD) return next();
  // 設定が片方だけ、または形が違う場合は、通さない (検証していないのに、しているように見えるのを防ぐ)
  if (!team || !auds.length) return c.json({ error: 'Cloudflare Access の検証の設定が正しくありません。ACCESS_TEAM_DOMAIN と ACCESS_AUD を確認してください。' }, 503);
  const token = c.req.header(HEADER) ?? '';
  let ok = false;
  try {
    ok = token !== '' && (await verifyAccessJwt(token, team, auds));
  } catch (err) {
    console.error('access verification failed', err instanceof Error ? err.message : '');
    return c.json({ error: '認証を確認できませんでした。時間をおいてやり直してください。' }, 503);
  }
  if (!ok) return c.json({ error: 'ログインが必要です。ページを再読み込みしてください。' }, 403);
  return next();
};
