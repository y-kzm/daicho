import type { DoiMetadata } from '../../shared/types';
import { HYBRID_VENUES } from '../config';
import { detectCountry } from './country';
import { parseJson, type Http } from './http';
import { normalizeKeyPart } from './text';

interface DateParts { 'date-parts'?: number[][] }

export interface CrossrefWork {
  type?: string;
  title?: string[];
  'container-title'?: string[];
  author?: { given?: string; family?: string }[];
  publisher?: string;
  member?: string | number;
  ISSN?: string[];
  URL?: string;
  event?: { name?: string; acronym?: string };
  abstract?: string;
  'published-print'?: DateParts;
  'published-online'?: DateParts;
  issued?: DateParts;
}

export async function fetchCrossrefWork(http: Http, doi: string): Promise<{ status: number; work: CrossrefWork | null }> {
  const res = await http.get(http.withMailto('https://api.crossref.org/works/' + encodeURIComponent(doi)));
  if (res.status !== 200) return { status: res.status, work: null };
  const work = parseJson<{ message?: CrossrefWork }>(res.text)?.message ?? null;
  return { status: work ? 200 : 502, work };
}

export function pickYear(m: CrossrefWork): string {
  const y =
    m['published-print']?.['date-parts']?.[0]?.[0] ??
    m['published-online']?.['date-parts']?.[0]?.[0] ??
    m.issued?.['date-parts']?.[0]?.[0];
  return y ? String(y) : '';
}

/** ハイブリッド会場 (形式はジャーナルだが実体は会議録) の会議名を補完する */
export function detectHybridConference(journalName: string): string {
  const j = String(journalName || '');
  if (!j) return '';
  for (const [re, conf] of HYBRID_VENUES) if (re.test(j)) return conf;
  if (/^proceedings\b/i.test(j)) return j;
  return '';
}

const SERIES_RE =
  /lecture notes|lncs|lnai|lnbip|ccis|communications in computer|ifip advances|advances in (?:information|intelligent)|epj web/i;

export async function crossrefToMetadata(http: Http, doi: string, m: CrossrefWork): Promise<DoiMetadata> {
  const year = pickYear(m);
  const containers = m['container-title'] || [];
  let series = '';
  let volumeTitle = '';
  for (const c of containers) {
    if (SERIES_RE.test(c)) { if (!series) series = c; }
    else if (!volumeTitle) volumeTitle = c;
  }
  const type = m.type || '';
  const isProceedings = type === 'proceedings-article' || /proceedings|conference/i.test(type);
  const isBookChapter = type === 'book-chapter';

  let journal = '';
  let conference = '';
  if (isProceedings || isBookChapter) {
    journal = series;
    conference = (m.event && (m.event.acronym || m.event.name)) || volumeTitle || (series ? '' : containers[0] || '');
  } else {
    journal = containers[0] || '';
    conference = detectHybridConference(journal);
  }

  const authors = (m.author || []).map((a) => [a.given, a.family].filter(Boolean).join(' ')).join('; ');
  const firstFamily = m.author?.[0]?.family || '';
  const country = await detectCountry(http, m.publisher || '', m.member ?? null, m.ISSN || [], journal || conference);
  return {
    doi,
    title: m.title?.[0] || '',
    year,
    publisher: m.publisher || '',
    country,
    journal,
    conference,
    url: m.URL || 'https://doi.org/' + doi,
    authors,
    bibkeySuggestion: firstFamily ? normalizeKeyPart(firstFamily) + year : '',
  };
}
