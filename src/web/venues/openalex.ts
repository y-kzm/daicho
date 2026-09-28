import type { VenueImport } from '../../shared/venues';

/** 論文誌の公開データ OpenAlex (CC0)。名前、ISSN、出版社を得る。日程や Impact Factor は無い */
export const OPENALEX_HOME = 'https://openalex.org/';
const API = 'https://api.openalex.org/sources';
const FIELDS = 'id,display_name,issn_l,host_organization_name,homepage_url,works_count,alternate_titles';

export interface OpenAlexSource {
  id?: unknown; display_name?: unknown; issn_l?: unknown; host_organization_name?: unknown; homepage_url?: unknown;
  works_count?: unknown; alternate_titles?: unknown;
}

export interface JournalHit { key: string; name: string; acronym: string; publisher: string; issn: string; works: number; data: VenueImport }

const s = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** 出版社の長い名前を、画面で使う短い名前にする */
const SHORT: [RegExp, string][] = [
  [/Institute of Electrical and Electronics Engineers/i, 'IEEE'], [/Association for Computing Machinery/i, 'ACM'],
  [/Springer/i, 'Springer'], [/Elsevier/i, 'Elsevier'], [/Wiley/i, 'Wiley'], [/Nature Portfolio/i, 'Nature Portfolio'],
];

/** 別名の中から、略称らしいもの (大文字と数字だけの短い語) を選ぶ */
function acronymOf(titles: unknown): string {
  const list = Array.isArray(titles) ? titles.map((t) => s(t, 60)) : [];
  return list.filter((t) => /^[A-Z][A-Za-z0-9&/-]{1,11}$/.test(t) && (t.match(/[A-Z]/g) ?? []).length >= 2).sort((a, b) => a.length - b.length)[0] ?? '';
}

export function fromOpenAlex(rec: OpenAlexSource): JournalHit | null {
  const name = s(rec.display_name);
  const key = s(rec.id, 80).replace(/^https?:\/\/openalex\.org\//, '');
  if (!name || !/^S\d+$/.test(key)) return null;
  const issn = s(rec.issn_l, 9).toUpperCase();
  const host = s(rec.host_organization_name);
  const publisher = SHORT.find(([re]) => re.test(host))?.[1] ?? host.slice(0, 60);
  const home = s(rec.homepage_url, 500);
  const acronym = acronymOf(rec.alternate_titles);
  return {
    key, name, acronym, publisher, issn: /^\d{4}-\d{3}[\dX]$/.test(issn) ? issn : '', works: typeof rec.works_count === 'number' ? rec.works_count : 0,
    data: {
      venue: {
        kind: 'journal', acronym, name, org: publisher, field: '', core: '', impactFactor: '',
        siteUrl: /^https?:\/\/[^\s]+$/i.test(home) ? home : '', issn: /^\d{4}-\d{3}[\dX]$/.test(issn) ? issn : '', reviewTime: '', submitUrl: '',
        note: '', source: 'openalex', sourceKey: key,
      },
      editions: [],
    },
  };
}

export function toJournalHits(body: unknown): JournalHit[] {
  const results = body && typeof body === 'object' ? (body as { results?: unknown }).results : null;
  const out: JournalHit[] = [];
  for (const r of Array.isArray(results) ? results : []) {
    const hit = r && typeof r === 'object' ? fromOpenAlex(r as OpenAlexSource) : null;
    if (hit && !out.some((o) => o.key === hit.key)) out.push(hit);
  }
  return out;
}

export async function searchJournals(query: string): Promise<JournalHit[]> {
  const q = query.replace(/[,|:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 2) return [];
  const url = `${API}?search=${encodeURIComponent(q)}&filter=type:journal&per-page=15&select=${FIELDS}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (res.status === 429) throw new Error('OpenAlex の 1 日の利用回数を超えました。明日やり直すか、手入力で追加してください。');
  if (!res.ok) throw new Error(`OpenAlex から取得できませんでした (${res.status})。`);
  return toJournalHits(await res.json());
}
