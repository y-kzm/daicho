import type { DoiMetadata } from '../../shared/types';
import { parseJson, type Http } from './http';
import { urlExists } from './text';

export interface IetfDoc {
  title?: string;
  rev?: string;
  time?: string;
  rev_history?: { rev?: string; published?: string }[];
  authors?: { name?: string }[];
  abstract?: string;
}

export async function fetchIetfDraftDoc(http: Http, name: string): Promise<IetfDoc | null> {
  const res = await http.get('https://datatracker.ietf.org/doc/' + name + '/doc.json');
  if (res.status !== 200) return null;
  const d = parseJson<IetfDoc>(res.text);
  return d && d.title ? d : null;
}

/** "draft-xxx-yy-00" または datatracker の URL から取得。見つからなければ null。 */
export async function fetchIetfDraftMetadata(http: Http, raw: string): Promise<DoiMetadata | null> {
  const m = String(raw).match(/(draft-[a-z0-9-]+)/i);
  if (!m) return null;
  let name = m[1]!.replace(/[/.]+$/, '');
  let rev = '';
  const rm = name.match(/^(draft-[a-z0-9-]+)-(\d{2})$/i);
  if (rm) { name = rm[1]!; rev = rm[2]!; }
  const d = await fetchIetfDraftDoc(http, name);
  if (!d) return null;
  const useRev = rev || String(d.rev || '');
  const fullName = name + (useRev ? '-' + useRev : '');
  let year = String(d.time || '').slice(0, 4);
  for (const h of d.rev_history || []) {
    if (String(h.rev) === useRev && h.published) year = String(h.published).slice(0, 4);
  }
  const jaUrl = 'https://tex2e.github.io/rfc-translater/html/draft/' + fullName + '.html';
  const url = (await urlExists(http, jaUrl))
    ? jaUrl
    : 'https://datatracker.ietf.org/doc/' + name + '/' + (useRev ? useRev + '/' : '');
  return {
    doi: '',
    title: fullName + ': ' + d.title,
    year,
    publisher: 'IETF (Internet-Draft)',
    country: 'アメリカ',
    journal: '', conference: '',
    url,
    authors: (d.authors || []).map((a) => a.name).filter(Boolean).join('; '),
    bibkeySuggestion: name,
  };
}
