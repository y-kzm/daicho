import { vi } from 'vitest';

export interface Route {
  match: string | RegExp;
  status?: number;
  body: string | object;
  headers?: Record<string, string>;
  /** 指定すると、そのメソッドの要求だけに一致する */
  method?: string;
}

export interface Call { url: string; method: string; headers: Record<string, string>; body: string }

/** mockFetch と同じだが、送った内容 (メソッド・ヘッダ・本文) も記録する */
export function mockFetchDetailed(routes: Route[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
      calls.push({ url, method, headers, body: typeof init?.body === 'string' ? init.body : '' });
      const r = routes.find((x) =>
        (x.method === undefined || x.method.toUpperCase() === method)
        && (typeof x.match === 'string' ? url.includes(x.match) : x.match.test(url)));
      if (!r) return new Response('not mocked: ' + url, { status: 404 });
      const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
      return new Response(body, { status: r.status ?? 200, headers: r.headers });
    }),
  );
  return calls;
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
