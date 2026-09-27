import type { DoiMetadata } from '../../shared/types';
import { detectCountry } from './country';
import type { Http } from './http';
import { normalizeKeyPart } from './text';

export async function fetchPageHtml(http: Http, url: string): Promise<string> {
  const res = await http.get(url);
  return res.status === 200 ? res.text : '';
}

export function unescapeHtml(s: string): string {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 論文ページの citation_* メタタグ (Google Scholar 形式) から取得。無ければ null。 */
export async function fetchPageMetadata(http: Http, url: string): Promise<DoiMetadata | null> {
  const html = await fetchPageHtml(http, url);
  if (!html) return null;
  const metas: Record<string, string> = {};
  const authors: string[] = [];
  const collect = (name: string, content: string) => {
    if (name === 'citation_author') authors.push(content);
    else if (!(name in metas)) metas[name] = content;
  };
  const re = /<meta\s+(?:name=["'](citation_[^"']+)["']\s+content=["']([^"']*)["']|content=["']([^"']*)["']\s+name=["'](citation_[^"']+)["'])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) collect(m[1], m[2] ?? '');
    else collect(m[4]!, m[3] ?? '');
  }

  const title = unescapeHtml(metas.citation_title || '');
  if (!title) return null;
  const year = (String(metas.citation_publication_date || metas.citation_date || '').match(/\d{4}/) || [''])[0]!;
  const conference = unescapeHtml(metas.citation_conference_title || metas.citation_conference || '');
  const journal = unescapeHtml(metas.citation_journal_title || '');
  const isUsenix = /usenix\.org/i.test(url);
  const publisher = unescapeHtml(metas.citation_publisher || '') || (isUsenix ? 'USENIX Association' : '');
  const country = isUsenix ? 'アメリカ' : await detectCountry(http, publisher, null, [], journal || conference);
  const family = (authors[0] || '').split(/\s+/).pop() || '';
  return {
    doi: '', title, year, publisher, country, journal, conference, url,
    authors: authors.map(unescapeHtml).join('; '),
    bibkeySuggestion: family ? normalizeKeyPart(family) + year : '',
  };
}
