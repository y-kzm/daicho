import { env } from 'cloudflare:test';
import { createApp } from '../../src/worker/index';

const app = createApp();

export interface ErrorBody { error: string }

/** JSON API を呼ぶ。body が undefined なら本文なしで送る。 */
export async function call<T = unknown>(
  method: string, path: string, body?: unknown,
): Promise<{ status: number; json: T }> {
  const init: RequestInit = body === undefined
    ? { method }
    : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await app.request(path, init, env);
  return { status: res.status, json: (await res.json()) as T };
}
