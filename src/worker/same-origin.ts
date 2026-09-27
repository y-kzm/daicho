import type { MiddlewareHandler } from 'hono';
import type { Env } from './env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 他のサイトから送られた書き込み (CSRF) を拒否する。読み取りは対象外。
 * ブラウザが付ける Sec-Fetch-Site を優先し、無い場合は Origin を自分のホストと比べる。
 * どちらも無い要求 (ブラウザ以外) は通す。認証は Cloudflare Access が行う。
 */
export function isCrossSite(req: { method: string; url: string; header: (name: string) => string | undefined }): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return false;
  const site = req.header('sec-fetch-site');
  // none = 利用者が直接開いた要求 (アドレスバーなど)
  if (site) return site !== 'same-origin' && site !== 'none';
  const origin = req.header('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(req.url).host;
  } catch {
    return true;
  }
}

export const sameOriginOnly: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (isCrossSite({ method: c.req.method, url: c.req.url, header: (n) => c.req.header(n) })) {
    return c.json({ error: 'この操作は、Daicho の画面からのみ行えます。' }, 403);
  }
  await next();
};
