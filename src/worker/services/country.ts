import { COUNTRY_CODE_JA, COUNTRY_JA, COUNTRY_OVERRIDES } from '../config';
import { parseJson, type Http } from './http';

/**
 * 出版社 → 出版国の自動検出。
 * 優先順: (0) 手動上書き → (0.5) 国内学会 → (1) OpenAlex の ISSN 登録国
 *        → (2) 出版社名に含まれる国名 → (3) Crossref members API の所在地
 */
export async function detectCountry(
  http: Http,
  publisher: string,
  memberId: string | number | null | undefined,
  issnList: string[],
  venueName: string,
): Promise<string> {
  const vn = String(venueName || '');
  if (vn) {
    for (const [re, country] of COUNTRY_OVERRIDES) if (re.test(vn)) return country;
  }
  if (/\b(IEICE|IPSJ)\b|電子情報通信学会|情報処理学会/i.test(String(publisher || '') + ' ' + vn)) return '日本';

  for (const issn of issnList || []) {
    const res = await http.get(http.withMailto('https://api.openalex.org/sources/issn:' + encodeURIComponent(issn)));
    if (res.status !== 200) continue;
    const cc = String(parseJson<{ country_code?: string }>(res.text)?.country_code || '').toUpperCase();
    if (cc) return COUNTRY_CODE_JA[cc] || cc;
  }

  const p = String(publisher || '');
  const lower = p.toLowerCase();
  const keys = Object.keys(COUNTRY_JA).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (new RegExp('\\b' + k + '\\b', 'i').test(lower)) return COUNTRY_JA[k]!;
  }
  if (/berlin heidelberg|\bberlin\b|\bheidelberg\b/i.test(p)) return 'ドイツ';
  if (/\bnew york\b|\bus\b$/i.test(p)) return 'アメリカ';
  if (/\bwien\b|\bvienna\b/i.test(p)) return 'オーストリア';

  if (memberId) {
    const res = await http.get(http.withMailto('https://api.crossref.org/members/' + encodeURIComponent(String(memberId))));
    if (res.status === 200) {
      const loc = String(parseJson<{ message?: { location?: string } }>(res.text)?.message?.location || '');
      const parts = loc.split(',').map((s) => s.trim()).filter(Boolean);
      const country = (parts[parts.length - 1] || '').toLowerCase();
      if (COUNTRY_JA[country]) return COUNTRY_JA[country]!;
      if (parts.length) return parts[parts.length - 1]!;
    }
  }
  return '';
}
