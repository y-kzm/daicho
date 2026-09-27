import type { DoiMetadata } from '../../shared/types';
import { parseJson, type Http } from './http';
import { normalizeKeyPart } from './text';

export interface DataCiteAttributes {
  titles?: { title?: string }[];
  publicationYear?: number | string;
  creators?: { name?: string; givenName?: string; familyName?: string }[];
  publisher?: string;
  url?: string;
  descriptions?: { description?: string }[];
}

export async function fetchDataCiteAttributes(http: Http, doi: string): Promise<DataCiteAttributes | null> {
  const res = await http.get('https://api.datacite.org/dois/' + encodeURIComponent(doi));
  if (res.status !== 200) return null;
  return parseJson<{ data?: { attributes?: DataCiteAttributes } }>(res.text)?.data?.attributes ?? null;
}

/** arXiv 等のプレプリント。見つからなければ null。 */
export async function fetchDataCiteMetadata(http: Http, doi: string): Promise<DoiMetadata | null> {
  const a = await fetchDataCiteAttributes(http, doi);
  if (!a) return null;
  const title = a.titles?.[0]?.title || '';
  const year = String(a.publicationYear || '');
  const creators = a.creators || [];
  const authors = creators.map((c) => c.name || [c.givenName, c.familyName].filter(Boolean).join(' ')).join('; ');
  const firstFamily = creators[0]?.familyName || '';
  const isArxiv = /arxiv/i.test(String(a.publisher || '')) || /10\.48550\//.test(doi);
  return {
    doi, title, year,
    publisher: isArxiv ? 'arXiv (プレプリント)' : String(a.publisher || ''),
    country: '', journal: '', conference: '',
    url: a.url || 'https://doi.org/' + doi,
    authors,
    bibkeySuggestion: firstFamily ? normalizeKeyPart(firstFamily) + year : '',
  };
}
