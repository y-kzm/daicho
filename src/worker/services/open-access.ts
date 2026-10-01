import { OA_STATUSES, type OaStatus, type OpenAccess } from '../../shared/types';
import { AppError } from '../errors';
import { parseJson, type Http } from './http';

/**
 * 1 回の判定で調べる DOI の数。OpenAlex には 1 件ずつ問い合わせる
 * (まとめて検索する API は、IP アドレスごとの 1 日の予算があり、多くの利用者と IP を共有する Cloudflare からでは使い切られている)。
 * Workers の無料プランでは、1 回の要求で外へ出せる要求が 50 件までなので、それより少なくする
 */
export const OA_BATCH = 40;
/** 同時に問い合わせる数 */
const PARALLEL = 8;

interface Work {
  doi?: unknown;
  open_access?: { oa_status?: unknown; oa_url?: unknown } | null;
  best_oa_location?: { license?: unknown; landing_page_url?: unknown; pdf_url?: unknown } | null;
}

/** 比べるための DOI の形 (小文字、前置きなし) */
export function normalizeDoi(doi: string): string {
  let s = doi;
  try {
    s = decodeURIComponent(doi);
  } catch {
    // % の後ろが数字でない DOI は、そのまま使う
  }
  // 前置き (https://www.doi.org/、doi: など) は、DOI の本体 (10. から始まる部分) より前をすべて捨てる
  return s.trim().toLowerCase().match(/10\.\d{4,9}\/\S+/)?.[0] ?? '';
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
 * 通信に失敗した DOI は結果に入れない (保存せず、次の判定で調べ直す)。すべて失敗した場合は例外にする。
 */
export async function lookupOpenAccess(http: Http, dois: string[], today: string): Promise<Map<string, OpenAccess>> {
  const wanted = [...new Set(dois.map(normalizeDoi).filter(Boolean))];
  if (wanted.length > OA_BATCH) throw new AppError(`一度に調べられるのは ${OA_BATCH} 件までです。`);
  const out = new Map<string, OpenAccess>();
  let failed = 0;
  const one = async (d: string): Promise<void> => {
    const res = await http.get(http.withMailto(`https://api.openalex.org/works/doi:${encodeURIComponent(d)}?select=${FIELDS}`));
    if (res.status === 200) {
      const w = parseJson<Work>(res.text);
      if (w) out.set(d, toOpenAccess(w, today));
      else failed++;
    } else if (res.status === 404) {
      // arXiv の論文は誰でも読める (OpenAlex に arXiv の DOI が無い場合がある)
      const arxiv = d.match(/^10\.48550\/arxiv\.(.+)$/)?.[1];
      out.set(d, arxiv
        ? { status: 'green', url: `https://arxiv.org/abs/${encodeURIComponent(arxiv).replace(/%2F/g, '/')}`, license: '', checkedAt: today }
        : { status: 'unknown', url: '', license: '', checkedAt: today });
    } else {
      failed++;
    }
  };
  for (let i = 0; i < wanted.length; i += PARALLEL) await Promise.all(wanted.slice(i, i + PARALLEL).map(one));
  if (wanted.length && failed === wanted.length) {
    throw new AppError('OpenAlex から取得できませんでした。時間をおいてやり直してください。', 502);
  }
  return out;
}
