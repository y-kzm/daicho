import { USER_AGENT } from '../services/http';
import { isPublicUrl } from './site';

const HOPS_MAX = 3;
const BYTES_MAX = 500_000;
const TIMEOUT_MS = 15000;

export interface Page { status: number; text: string; url: string }

/**
 * 外部のページを取得する。転送は自動では追わず、転送先も取得してよい宛先かを確かめる。
 * 本文は先頭の 500 KB までしか読まない。取得できない場合は status 0 を返す。
 */
export async function fetchPage(url: string): Promise<Page> {
  let current = url;
  for (let hop = 0; hop <= HOPS_MAX; hop++) {
    if (!isPublicUrl(current)) return { status: 0, text: '', url: current };
    let res: Response;
    try {
      res = await fetch(current, {
        method: 'GET', redirect: 'manual', headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*;q=0.5' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { status: 0, text: '', url: current };
    }
    if (res.status !== 200) await res.body?.cancel().catch(() => undefined);
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get('location');
      if (!to) return { status: res.status, text: '', url: current };
      try {
        current = new URL(to, current).toString();
      } catch {
        return { status: 0, text: '', url: current };
      }
      continue;
    }
    return { status: res.status, text: res.status === 200 ? await readLimited(res) : '', url: current };
  }
  return { status: 0, text: '', url: current };
}

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, BYTES_MAX);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < BYTES_MAX) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const all = new Uint8Array(Math.min(size, BYTES_MAX));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.min(c.length, all.length - at));
    all.set(part, at);
    at += part.length;
    if (at >= all.length) break;
  }
  return new TextDecoder().decode(all);
}
