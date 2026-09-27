import type { DoiMetadata } from '../../shared/types';
import { AppError } from '../errors';
import { crossrefToMetadata, fetchCrossrefWork } from './crossref';
import { fetchDataCiteMetadata } from './datacite';
import type { Http } from './http';
import { fetchIetfDraftMetadata } from './ietf';
import { fetchJaLCMetadata } from './jalc';
import { fetchPageMetadata } from './page-meta';
import { normalizeKeyPart, urlExists } from './text';

export { normalizeKeyPart, urlExists };

export function extractDoi(input: string): string | null {
  if (!input) return null;
  const match = String(input).trim().match(/10\.\d{4,9}\/[^\s"'<>]+/);
  if (!match) return null;
  const doi = match[0].replace(/[.,;]+$/, '');
  if (/^10\.5555\//.test(doi)) return null; // ACM DL の内部 ID
  return doi;
}

/** RFC (10.17487/rfcNNNN) 向けの後処理 */
async function applyRfcRules(http: Http, r: DoiMetadata): Promise<void> {
  const m = String(r.doi || '').match(/^10\.17487\/rfc(\d+)$/i);
  if (!m) return;
  const num = m[1]!;
  if (!/^rfc\s*\d+/i.test(r.title)) r.title = 'RFC ' + num + ': ' + r.title;
  const jaUrl = 'https://tex2e.github.io/rfc-translater/html/rfc' + num + '.html';
  r.url = (await urlExists(http, jaUrl)) ? jaUrl : 'https://www.rfc-editor.org/rfc/rfc' + num;
  r.publisher = 'RFC Editor (IETF)';
  r.country = 'アメリカ';
  r.bibkeySuggestion = 'rfc' + num;
}

export async function fetchDoiMetadata(http: Http, input: string): Promise<DoiMetadata> {
  const raw = String(input || '').trim();
  const doi = extractDoi(raw);
  if (!doi) {
    const rfcm = raw.match(/^rfc[\s-]?(\d{1,5})$/i) || raw.match(/(?:^|\/)rfc(\d{1,5})(?:\.html|\.txt|\/|$)/i);
    if (rfcm) return fetchDoiMetadata(http, '10.17487/rfc' + rfcm[1]);
    if (/(^|\/)draft-[a-z0-9-]+/i.test(raw)) {
      const dm = await fetchIetfDraftMetadata(http, raw);
      if (dm) return dm;
    }
    if (/^https?:\/\//i.test(raw)) {
      const page = await fetchPageMetadata(http, raw);
      if (page) return page;
    }
    if (/10\.5555\//.test(raw)) {
      throw new AppError(
        '10.5555/… は ACM Digital Library の内部 ID で、正式な DOI ではありません。USENIX 系論文なら usenix.org の論文ページ URL を入力してください。',
      );
    }
    if (/^https?:\/\//i.test(raw)) {
      throw new AppError('この URL から論文メタデータを取得できませんでした。DOI があれば DOI を入力してください。');
    }
    throw new AppError('DOI を認識できませんでした。例: 10.1145/3517745.3563019');
  }
  const { status, work } = await fetchCrossrefWork(http, doi);
  if (status === 404) {
    const dc = await fetchDataCiteMetadata(http, doi);
    if (dc) return dc;
    const jalc = await fetchJaLCMetadata(http, doi);
    if (jalc) return jalc;
    throw new AppError('Crossref / DataCite / JaLC のいずれにも登録されていない DOI です: ' + doi);
  }
  if (status !== 200 || !work) throw new AppError('Crossref API エラー (HTTP ' + status + ')', 502);
  const result = await crossrefToMetadata(http, doi, work);
  await applyRfcRules(http, result);
  return result;
}
