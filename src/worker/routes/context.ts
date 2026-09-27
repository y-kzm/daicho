import type { Context } from 'hono';
import type { Env } from '../env';
import { AppError } from '../errors';
import { createHttp, type Http } from '../services/http';

export function httpFor(env: Env): Http {
  return createHttp({ mailto: env.CONTACT_MAILTO });
}

/** JSON 本文をオブジェクトとして読む。JSON でない・オブジェクトでない場合は 400。 */
export async function jsonBody(c: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError('リクエスト本文が不正です。');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('リクエスト本文が不正です。');
  return body as Record<string, unknown>;
}
