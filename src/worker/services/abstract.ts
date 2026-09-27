import { fetchCrossrefWork } from './crossref';
import { fetchDataCiteAttributes } from './datacite';
import { extractDoi } from './doi';
import { parseJson, type Http } from './http';
import { fetchIetfDraftDoc } from './ietf';
import { fetchPageHtml } from './page-meta';

export interface AbstractResult { text: string; source: string }

const MAX = 4000;
const MIN_PAGE_LEN = 80;
const squash = (s: string) => String(s || '').replace(/\s+/g, ' ').trim();

/** 論文ページの HTML からアブストラクトを抽出する。取得できなければ ''。 */
export async function fetchAbstractFromPage(http: Http, url: string): Promise<string> {
  const html = await fetchPageHtml(http, url);
  if (!html) return '';
  let a = '';
  let m =
    html.match(/<meta[^>]+name=["']citation_abstract["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']citation_abstract["']/i);
  if (m) a = m[1]!;
  if (!a) { m = html.match(/<div[^>]*id="Abs1-content"[^>]*>([\s\S]*?)<\/div>/i); if (m) a = m[1]!; }
  if (!a) { m = html.match(/field-name-field-paper-description[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i); if (m) a = m[1]!; }
  if (!a) {
    m =
      html.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:og:)?description["']/i);
    if (m) a = m[1]!;
  }
  a = squash(
    String(a).replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' '),
  );
  return a.length >= MIN_PAGE_LEN ? a.slice(0, MAX) : '';
}

/** DOI からアブストラクトを取得。Crossref → DataCite → Semantic Scholar → OpenAlex → 論文ページ。 */
export async function fetchAbstract(http: Http, doi: string): Promise<AbstractResult> {
  const cr = await fetchCrossrefWork(http, doi);
  const crText = squash(String(cr.work?.abstract || '').replace(/<[^>]+>/g, ' '));
  if (crText) return { text: crText.slice(0, MAX), source: 'Crossref' };

  const dc = await fetchDataCiteAttributes(http, doi);
  const dcText = squash(dc?.descriptions?.[0]?.description || '');
  if (dcText.length >= MIN_PAGE_LEN) return { text: dcText.slice(0, MAX), source: 'DataCite' };

  const s2 = await http.get('https://api.semanticscholar.org/graph/v1/paper/DOI:' + doi + '?fields=abstract');
  if (s2.status === 200) {
    const t = squash(parseJson<{ abstract?: string }>(s2.text)?.abstract || '');
    if (t) return { text: t.slice(0, MAX), source: 'Semantic Scholar' };
  }

  const oa = await http.get(http.withMailto('https://api.openalex.org/works/doi:' + doi));
  if (oa.status === 200) {
    const inv = parseJson<{ abstract_inverted_index?: Record<string, number[]> }>(oa.text)?.abstract_inverted_index;
    if (inv) {
      const pos: string[] = [];
      for (const w of Object.keys(inv)) for (const p of inv[w]!) pos[p] = w;
      const t = squash(pos.filter(Boolean).join(' '));
      if (t) return { text: t.slice(0, MAX), source: 'OpenAlex' };
    }
  }

  const page = await fetchAbstractFromPage(http, 'https://doi.org/' + doi);
  if (page) return { text: page, source: '論文ページ' };
  return { text: '', source: '' };
}

/** エントリ情報からアブストラクトを解決する */
export async function resolveAbstract(http: Http, input: { doi?: string; url?: string }): Promise<AbstractResult> {
  const doi = extractDoi(input.doi || input.url || '');
  if (doi) {
    const got = await fetchAbstract(http, doi);
    if (got.text) return got;
  }
  const url = String(input.url || '').trim();
  const dm = url.match(/datatracker\.ietf\.org\/doc\/(draft-[a-z0-9-]+)/i) || String(input.doi || '').match(/^(draft-[a-z0-9-]+)/i);
  if (dm) {
    const d = await fetchIetfDraftDoc(http, dm[1]!.replace(/-\d{2}$/, ''));
    const a = squash(d?.abstract || '');
    if (a.length >= MIN_PAGE_LEN) return { text: a.slice(0, MAX), source: 'IETF Datatracker' };
  }
  if (/^https?:\/\//i.test(url)) {
    const text = await fetchAbstractFromPage(http, url);
    if (text) return { text, source: '論文ページ' };
  }
  return { text: '', source: '' };
}
