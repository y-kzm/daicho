import type { Entry, EntryInput } from '../../shared/types';
import { AppError } from '../errors';
import { fetchCrossrefWork } from './crossref';
import { normalizeKeyPart } from './doi';
import type { Http } from './http';

export const BIBTEX_MAX = 45; // 無料プランの外部 subrequest 上限 (50) に収める

const STOP = ['with', 'from', 'this', 'that', 'based'];

/** BibTeX キー: タイトル先頭の有意語 + 年 (同期処理) */
export function titleBibkey(e: Pick<EntryInput, 'title' | 'year'>): string {
  const word =
    String(e.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.includes(w))[0] || 'paper';
  return word + (e.year || '');
}

/** BibTeX キー: Crossref の第一著者姓 + 年、無ければタイトル先頭の有意語 + 年 */
export async function generateBibkey(http: Http, e: Pick<EntryInput, 'doi' | 'title' | 'year'>): Promise<string> {
  if (e.doi) {
    const { work } = await fetchCrossrefWork(http, e.doi);
    const family = work?.author?.[0]?.family || '';
    if (family) return normalizeKeyPart(family) + (e.year || '');
  }
  return titleBibkey(e);
}

export async function fetchBibtexFromCrossref(http: Http, doi: string, preferredKey: string): Promise<string | null> {
  const res = await http.get(
    http.withMailto('https://api.crossref.org/works/' + encodeURIComponent(doi) + '/transform/application/x-bibtex'),
  );
  if (res.status !== 200) return null;
  let bib = res.text.trim();
  if (preferredKey) bib = bib.replace(/^(@\w+\{)[^,]+,/, '$1' + preferredKey + ',');
  await http.sleep(120);
  return bib;
}

export function buildManualBibtex(e: Entry): string {
  const key = e.bibkey || titleBibkey(e);
  const type = e.conference ? 'inproceedings' : e.journal ? 'article' : 'misc';
  const fields = ['  title = {' + e.title + '}'];
  if (e.journal) fields.push('  journal = {' + e.journal + '}');
  if (e.conference) fields.push('  booktitle = {' + e.conference + '}');
  if (e.year) fields.push('  year = {' + e.year + '}');
  if (e.publisher) fields.push('  publisher = {' + e.publisher + '}');
  if (e.doi) fields.push('  doi = {' + e.doi + '}');
  if (e.url) fields.push('  url = {' + e.url + '}');
  fields.push('  note = {author 情報未登録: 手動で補完すること}');
  return '@' + type + '{' + key + ',\n' + fields.join(',\n') + '\n}';
}

export async function exportBibtex(http: Http, entries: Entry[]): Promise<string> {
  if (!entries.length) throw new AppError('対象のエントリがありません。');
  if (entries.length > BIBTEX_MAX) {
    throw new AppError(`一度に出力できるのは ${BIBTEX_MAX} 件までです (Crossref への負荷対策)。絞り込んでから出力してください。`);
  }
  const chunks: string[] = [];
  for (const e of entries) {
    const bib = e.doi ? await fetchBibtexFromCrossref(http, e.doi, e.bibkey) : null;
    chunks.push(bib ?? buildManualBibtex(e));
  }
  return chunks.join('\n\n');
}
