import { vi } from 'vitest';

export interface Route {
  match: string | RegExp;
  status?: number;
  body: string | object;
}

/** URL 部分一致でレスポンスを返す fetch スタブ。戻り値は呼ばれた URL の配列。 */
export function mockFetch(routes: Route[]): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      const r = routes.find((x) => (typeof x.match === 'string' ? url.includes(x.match) : x.match.test(url)));
      if (!r) return new Response('not mocked: ' + url, { status: 404 });
      const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
      return new Response(body, { status: r.status ?? 200 });
    }),
  );
  return calls;
}
