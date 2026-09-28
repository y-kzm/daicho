import { isDueLocal, parseDateRange, tzOffsetMinutes, type DeadlineInput, type EditionInput, type VenueImport } from '../../shared/venues';

/** 公開データ ccfddl/ccf-deadlines (MIT License) の 1 会議ぶん */
export interface CcfddlRecord {
  title?: unknown;
  description?: unknown;
  sub?: unknown;
  rank?: { core?: unknown } | null;
  confs?: unknown;
}

export const CCFDDL_URL = 'https://ccfddl.com/conference/allconf.yml';
export const CCFDDL_HOME = 'https://github.com/ccfddl/ccf-deadlines';
/** 取り込む開催の範囲: 去年以降 (古い年まで入れると一覧が埋まる) */
const YEARS_BACK = 1;

const s = (v: unknown, max = 300): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const ORGS = ['ACM', 'IEEE', 'USENIX', 'IFIP', 'ISOC', 'IACR', 'AAAI', 'SIAM'];

function toDue(v: unknown): string {
  const t = s(v, 30).replace('T', ' ').replace(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}):\d{2}$/, '$1');
  return isDueLocal(t) ? t : '';
}

function toEdition(conf: Record<string, unknown>): EditionInput | null {
  const year = Number(conf.year);
  if (!Number.isInteger(year) || year < 1950 || year > 2100) return null;
  const tzRaw = s(conf.timezone, 12);
  const timezone = tzOffsetMinutes(tzRaw) === null ? 'AoE' : tzRaw;
  const deadlines: DeadlineInput[] = [];
  for (const item of Array.isArray(conf.timeline) ? conf.timeline : []) {
    const t = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const label = s(t.comment, 80);
    const abstract = toDue(t.abstract_deadline);
    const paper = toDue(t.deadline);
    if (abstract) deadlines.push({ kind: 'abstract', label, dueLocal: abstract, timezone, estimated: false, source: 'ccfddl' });
    if (paper) deadlines.push({ kind: 'paper', label, dueLocal: paper, timezone, estimated: false, source: 'ccfddl' });
  }
  const dateText = s(conf.date, 80);
  const range = parseDateRange(dateText, year);
  const link = s(conf.link, 500);
  return {
    year, label: '', siteUrl: /^https?:\/\/[^\s]+$/i.test(link) ? link : '', place: s(conf.place, 120), dateText,
    startDate: range?.start ?? '', endDate: range?.end ?? '', estimated: false, source: 'ccfddl', note: '',
    deadlines: deadlines.slice(0, 20),
  };
}

/** 公開データの 1 件を、取り込みの形にする。名前が無いものは null */
export function fromCcfddl(rec: CcfddlRecord, thisYear: number): VenueImport | null {
  const acronym = s(rec.title, 60);
  const name = s(rec.description) || acronym;
  if (!acronym) return null;
  const sub = s(rec.sub, 10) || 'XX';
  const core = s(rec.rank?.core, 20);
  const editions: EditionInput[] = [];
  const seen = new Set<number>();
  for (const c of Array.isArray(rec.confs) ? rec.confs : []) {
    const e = c && typeof c === 'object' ? toEdition(c as Record<string, unknown>) : null;
    if (!e || e.year < thisYear - YEARS_BACK || seen.has(e.year)) continue;
    seen.add(e.year);
    editions.push(e);
  }
  editions.sort((a, b) => b.year - a.year);
  return {
    venue: {
      kind: 'conference', acronym, name, org: ORGS.find((o) => new RegExp(`\\b${o}\\b`).test(name)) ?? '', field: '',
      // 公開データでは、順位なしを N と書く
      core: /^(A\*|A|B|C)$/.test(core) ? core : '', impactFactor: '', siteUrl: '', note: '',
      source: 'ccfddl', sourceKey: `${sub}/${acronym.toLowerCase()}`,
    },
    editions: editions.slice(0, 40),
  };
}

export interface CatalogItem { key: string; acronym: string; name: string; sub: string; core: string; latestYear: number; data: VenueImport }

export function toCatalog(records: unknown, thisYear: number): CatalogItem[] {
  const out: CatalogItem[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(records) ? records : []) {
    const data = r && typeof r === 'object' ? fromCcfddl(r as CcfddlRecord, thisYear) : null;
    if (!data || seen.has(data.venue.sourceKey)) continue;
    seen.add(data.venue.sourceKey);
    out.push({
      key: data.venue.sourceKey, acronym: data.venue.acronym, name: data.venue.name, sub: data.venue.sourceKey.split('/')[0] ?? '',
      core: data.venue.core, latestYear: data.editions[0]?.year ?? 0, data,
    });
  }
  return out.sort((a, b) => a.acronym.localeCompare(b.acronym, 'en', { sensitivity: 'base' }));
}

/** 略称と正式名で探す。前方一致を先に、語の途中の一致を後に並べる */
export function searchCatalog(items: readonly CatalogItem[], query: string, limit = 40): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  const scored: [number, CatalogItem][] = [];
  for (const it of items) {
    const a = it.acronym.toLowerCase();
    const n = it.name.toLowerCase();
    const score = a === q ? 4 : a.startsWith(q) ? 3 : a.includes(q) ? 2 : n.includes(q) ? 1 : 0;
    if (score) scored.push([score, it]);
  }
  return scored.sort((x, y) => y[0] - x[0] || x[1].acronym.localeCompare(y[1].acronym)).slice(0, limit).map((x) => x[1]);
}

/** 公開データを取得して解析する。解析の道具は、使うときにだけ読み込む */
export async function loadCatalog(thisYear: number): Promise<CatalogItem[]> {
  const res = await fetch(CCFDDL_URL, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`公開データを取得できませんでした (${res.status})。`);
  const { parse } = await import('yaml');
  return toCatalog(parse(await res.text()), thisYear);
}
