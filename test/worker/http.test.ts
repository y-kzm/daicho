import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttp, parseJson, sleep } from '../../src/worker/services/http';

describe('createHttp', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('withMailto appends mailto only when configured', () => {
    expect(createHttp({ mailto: '' }).withMailto('https://x/y')).toBe('https://x/y');
    expect(createHttp({ mailto: 'a@b.c' }).withMailto('https://x/y')).toBe('https://x/y?mailto=a%40b.c');
    expect(createHttp({ mailto: 'a@b.c' }).withMailto('https://x/y?q=1')).toBe('https://x/y?q=1&mailto=a%40b.c');
  });

  it('get returns status and text and never throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const r = await createHttp({}).get('https://example.com');
    expect(r).toEqual({ status: 404, text: 'nope' });
  });

  it('get returns status 0 on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('boom'); }));
    expect(await createHttp({}).get('https://example.com')).toEqual({ status: 0, text: '' });
  });

  it('postJson sends JSON with headers', async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => new Response(JSON.stringify(init.body), { status: 200 }));
    vi.stubGlobal('fetch', f);
    await createHttp({}).postJson('https://e/x', { a: 1 }, { 'x-api-key': 'k' });
    const init = f.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
  });

  it('sleep defaults to the real timer and can be injected for tests', async () => {
    expect(createHttp({}).sleep).toBe(sleep);
    const injected = vi.fn(async () => {});
    const http = createHttp({ sleep: injected });
    await http.sleep(1000);
    expect(injected).toHaveBeenCalledWith(1000);
  });

  it('parseJson returns null on garbage', () => {
    expect(parseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson('<html>')).toBeNull();
  });
});
