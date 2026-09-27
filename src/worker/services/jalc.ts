import type { DoiMetadata } from '../../shared/types';
import { detectCountry } from './country';
import { parseJson, type Http } from './http';
import { normalizeKeyPart } from './text';

interface Lang { lang?: string }
interface JalcData {
  title_list?: (Lang & { title?: string })[];
  journal_title_name_list?: (Lang & { journal_title_name?: string })[];
  publisher_list?: (Lang & { publisher_name?: string })[];
  publication_date?: { publication_year?: number | string };
  creator_list?: { names?: (Lang & { first_name?: string; last_name?: string })[] }[];
  journal_id_list?: { type?: string; journal_id?: string }[];
  url?: string;
}

function pickLang<T extends Lang>(list: T[] | undefined, key: keyof T): string {
  const arr = list || [];
  const ja = arr.find((x) => x.lang === 'ja');
  const en = arr.find((x) => x.lang === 'en');
  return String(((ja || en || arr[0]) as T | undefined)?.[key] ?? '');
}

/** JaLC (日本の学会誌 DOI)。見つからなければ null。 */
export async function fetchJaLCMetadata(http: Http, doi: string): Promise<DoiMetadata | null> {
  const res = await http.get('https://api.japanlinkcenter.org/dois/' + doi);
  if (res.status !== 200) return null;
  const d = parseJson<{ data?: JalcData }>(res.text)?.data;
  if (!d) return null;
  const title = pickLang(d.title_list, 'title');
  const journal = pickLang(d.journal_title_name_list, 'journal_title_name');
  const publisher = pickLang(d.publisher_list, 'publisher_name');
  const year = String(d.publication_date?.publication_year || '');
  const creators = d.creator_list || [];
  const authors = creators
    .map((c) => {
      const names = c.names || [];
      const any = names.find((n) => n.lang === 'en') || names[0] || {};
      return [any.first_name, any.last_name].filter(Boolean).join(' ');
    })
    .join('; ');
  const firstFamily = (creators[0]?.names || []).find((n) => n.lang === 'en')?.last_name || '';
  const issns = (d.journal_id_list || [])
    .filter((j) => String(j.type).toUpperCase() === 'ISSN')
    .map((j) => String(j.journal_id));
  const country = (await detectCountry(http, publisher, null, issns, journal)) || '日本';
  return {
    doi, title, year, publisher, country, journal, conference: '',
    url: d.url || 'https://doi.org/' + doi,
    authors,
    bibkeySuggestion: firstFamily ? normalizeKeyPart(firstFamily) + year : '',
  };
}
