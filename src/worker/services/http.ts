export interface HttpResult {
  status: number;
  text: string;
}

export interface Http {
  get(url: string, init?: { headers?: Record<string, string> }): Promise<HttpResult>;
  postJson(url: string, body: unknown, headers?: Record<string, string>): Promise<HttpResult>;
  /** Crossref / OpenAlex の polite pool 用に mailto= を付与する */
  withMailto(url: string): string;
  /** リトライ待機。テストでは注入して待機をなくす。 */
  sleep(ms: number): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 20000;
export const USER_AGENT = 'Mozilla/5.0 (compatible; daicho; +https://github.com/y-kzm/daicho)';

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function run(url: string, init: RequestInit, timeoutMs: number): Promise<HttpResult> {
  try {
    const res = await fetch(url, { ...init, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    return { status: res.status, text: await res.text() };
  } catch {
    return { status: 0, text: '' };
  }
}

export function createHttp(opts: { mailto?: string; timeoutMs?: number; sleep?: (ms: number) => Promise<void> }): Http {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const mailto = (opts.mailto ?? '').trim();
  const sleepFn = opts.sleep ?? sleep;
  return {
    sleep: sleepFn,
    get(url, init) {
      return run(url, { method: 'GET', headers: { 'user-agent': USER_AGENT, ...(init?.headers ?? {}) } }, timeoutMs);
    },
    postJson(url, body, headers) {
      return run(
        url,
        { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT, ...(headers ?? {}) }, body: JSON.stringify(body) },
        timeoutMs,
      );
    },
    withMailto(url) {
      if (!mailto) return url;
      return url + (url.includes('?') ? '&' : '?') + 'mailto=' + encodeURIComponent(mailto);
    },
  };
}
