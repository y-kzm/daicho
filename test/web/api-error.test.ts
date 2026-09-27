import { describe, expect, it } from 'vitest';
import { isSessionRedirect, parseApiResponse, SESSION_EXPIRED_MESSAGE } from '../../src/web/api';

describe('parseApiResponse', () => {
  it('returns JSON on 2xx', async () => {
    expect(await parseApiResponse(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }))).toEqual({ ok: true });
  });
  it('throws the server error message', async () => {
    await expect(parseApiResponse(new Response('{"error":"だめ"}', { status: 400 }))).rejects.toThrow('だめ');
  });
  it('detects an HTML login page (Cloudflare Access session expired)', async () => {
    await expect(parseApiResponse(new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } })))
      .rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  });
  it('falls back to HTTP status', async () => {
    await expect(parseApiResponse(new Response('', { status: 502 }))).rejects.toThrow('HTTP 502');
  });
});

describe('isSessionRedirect', () => {
  it('detects an opaque redirect (Cloudflare Access expired session)', () => {
    expect(isSessionRedirect({ type: 'opaqueredirect', status: 0 })).toBe(true);
  });
  it('does not flag a normal successful response', () => {
    expect(isSessionRedirect({ type: 'basic', status: 200 })).toBe(false);
  });
});
