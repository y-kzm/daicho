import { OA_STATUSES, type OaStatus, type OpenAccess } from '../../shared/types';
import { AppError } from '../errors';
import { parseJson, type Http } from './http';

/** 1 回の問い合わせで調べる DOI の数 (OpenAlex の filter で OR できる上限) */
export const OA_BATCH = 50;

interface Work {
  doi?: unknown;
  open_access?: { oa_status?: unknown; oa_url?: unknown } | null;
  best_oa_location?: { license?: unknown; landing_page_url?: unknown; pdf_url?: unknown } | null;
}

/** 比べるための DOI の形 (小文字、前置きなし) */
export function normalizeDoi(doi: string): string {
  return doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '');
}

const webUrl = (v: unknown): string => (typeof v === 'string' && /^https?:\/\/[^\s]+$/i.test(v) && v.length <= 500 ? v : '');

/** OpenAlex の 1 件を、保存する形にする */
export function toOpenAccess(w: Work, today: string): OpenAccess {
  const raw = String(w.open_access?.oa_status ?? '');
  const status: OaStatus = (OA_STATUSES as readonly string[]).includes(raw) && raw !== 'unknown' ? (raw as OaStatus) : 'unknown';
  const best = w.best_oa_location ?? {};
  const license = typeof best.license === 'string' ? best.license.slice(0, 40) : '';
  const url = status === 'closed' ? '' : webUrl(w.open_access?.oa_url) || webUrl(best.pdf_url) || webUrl(best.landing_page_url);
  return { status, url, license, checkedAt: today };
}

const FIELDS = 'doi,open_access,best_oa_location';

/**
 * DOI ごとに Open Access を調べる。OpenAlex に無い DOI は unknown にする。
 * 通信に失敗した場合は、保存しないように例外にする。
 */
export async function lookupOpenAccess(http: Http, dois: string[], today: string): Promise<Map<string, OpenAccess>> {
  const wanted = [...new Set(dois.map(normalizeDoi).filter(Boolean))];
  if (wanted.length > OA_BATCH) throw new AppError(`一度に調べられるのは ${OA_BATCH} 件までです。`);
  const out = new Map<string, OpenAccess>();
  if (!wanted.length) return out;
  // 区切りの記号 (| と ,) を含む DOI は、1 件ずつ問い合わせる
  const plain = wanted.filter((d) => !/[|,]/.test(d));
  const odd = wanted.filter((d) => /[|,]/.test(d));
  const works: Work[] = [];
  if (plain.length) {
    const url = `https://api.openalex.org/works?filter=doi:${plain.map(encodeURIComponent).join('|')}&per-page=${OA_BATCH}&select=${FIELDS}`;
    const res = await http.get(http.withMailto(url));
    if (res.status !== 200) throw new AppError('OpenAlex から取得できませんでした。時間をおいてやり直してください。', 502);
    const body = parseJson<{ results?: Work[] }>(res.text);
    works.push(...(Array.isArray(body?.results) ? body!.results : []));
  }
  for (const d of odd) {
    const res = await http.get(http.withMailto(`https://api.openalex.org/works/doi:${encodeURIComponent(d)}?select=${FIELDS}`));
    if (res.status === 200) {
      const w = parseJson<Work>(res.text);
      if (w) works.push(w);
    } else if (res.status !== 404) {
      throw new AppError('OpenAlex から取得できませんでした。時間をおいてやり直してください。', 502);
    }
  }
  for (const w of works) {
    const d = normalizeDoi(String(w.doi ?? ''));
    if (wanted.includes(d)) out.set(d, toOpenAccess(w, today));
  }
  for (const d of wanted) {
    if (out.has(d)) continue;
    // arXiv の論文は誰でも読める (OpenAlex に arXiv の DOI が無い場合がある)
    const arxiv = d.match(/^10\.48550\/arxiv\.(.+)$/)?.[1];
    out.set(d, arxiv
      ? { status: 'green', url: `https://arxiv.org/abs/${encodeURIComponent(arxiv).replace(/%2F/g, '/')}`, license: '', checkedAt: today }
      : { status: 'unknown', url: '', license: '', checkedAt: today });
  }
  return out;
}
