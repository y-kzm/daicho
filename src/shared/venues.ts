/** 会議・論文誌の管理で、サーバーと画面が共有する型と計算 */

export const VENUE_KINDS = ['conference', 'journal'] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];
export const VENUE_KIND_LABELS: Record<VenueKind, string> = { conference: '国際会議', journal: '論文誌' };

export const DEADLINE_KINDS = ['abstract', 'paper', 'notification', 'camera', 'other'] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];
export const DEADLINE_LABELS: Record<DeadlineKind, string> = {
  abstract: 'アブストラクト締切', paper: '論文締切', notification: '採否通知', camera: 'カメラレディ', other: 'その他',
};

/**
 * 取得元。manual = 手で入力・修正した、ccfddl = 公開データ、ai = AI の候補を反映した、
 * estimate = 前の年から予想で作ったまま (公開データに実際の日付が出たら置き換える)
 */
export const VENUE_SOURCES = ['manual', 'ccfddl', 'ai', 'estimate'] as const;
export type VenueSource = (typeof VENUE_SOURCES)[number];

export const VENUES_MAX = 200;
export const EDITIONS_MAX = 40;
export const DEADLINES_MAX = 20;

export interface VenueDeadline {
  id: number;
  kind: DeadlineKind;
  /** 複数回ある場合の名前 (例: Cycle 1) */
  label: string;
  /** `YYYY-MM-DD` または `YYYY-MM-DD HH:MM`。timezone での日時 */
  dueLocal: string;
  timezone: string;
  /** 前年からの予想 (未確認) */
  estimated: boolean;
  source: VenueSource;
}

export interface VenueEdition {
  id: number;
  year: number;
  label: string;
  siteUrl: string;
  place: string;
  dateText: string;
  startDate: string;
  endDate: string;
  estimated: boolean;
  source: VenueSource;
  note: string;
  deadlines: VenueDeadline[];
}

export interface Venue {
  id: number;
  kind: VenueKind;
  acronym: string;
  name: string;
  org: string;
  field: string;
  core: string;
  impactFactor: string;
  siteUrl: string;
  note: string;
  source: VenueSource;
  sourceKey: string;
  archived: boolean;
  editions: VenueEdition[];
}

export interface VenueData {
  venues: Venue[];
  /** カレンダーの購読 URL に使うトークン。未発行なら null */
  calendarToken: string | null;
}

export type DeadlineInput = Omit<VenueDeadline, 'id'>;
export type EditionInput = Omit<VenueEdition, 'id' | 'deadlines'> & { deadlines: DeadlineInput[] };
export type VenueInput = Omit<Venue, 'id' | 'editions' | 'archived'>;
/** 公開データからの取り込み (1 会議ぶん) */
export interface VenueImport { venue: VenueInput; editions: EditionInput[] }

/** AI がページから読み取った候補。保存はせず、利用者が選んで反映する */
export interface ExtractedEdition {
  place: string;
  dateText: string;
  startDate: string;
  endDate: string;
  deadlines: DeadlineInput[];
  /** 候補の根拠になったページ */
  pageUrl: string;
  provider: string;
}

export interface SiteSearchResult {
  /** 見つかったサイト。見つからなければ空 */
  siteUrl: string;
  tried: string[];
}

/* ---------- 時刻 ---------- */

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * timezone の UTC からのずれ (分)。AoE (Anywhere on Earth) は UTC-12。
 * 読めない表記は null (呼び出し側は AoE として扱い、画面で確認を促す)。
 */
export function tzOffsetMinutes(tz: string): number | null {
  const s = tz.trim().toUpperCase();
  if (s === 'AOE') return -720;
  if (s === 'UTC' || s === 'GMT' || s === 'Z') return 0;
  if (s === 'JST') return 540;
  const m = s.match(/^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[2]);
  const min = Number(m[3] ?? 0);
  if (h > 14 || min > 59) return null;
  return (m[1] === '-' ? -1 : 1) * (h * 60 + min);
}

const DUE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

export function isDueLocal(s: string): boolean {
  const m = s.match(DUE);
  if (!m) return false;
  const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || se > 59) return false;
  // 2 月 30 日などを除く
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** 時刻が書かれていれば true (日付だけなら、その日の終わりを締切とみなす) */
export function hasTime(dueLocal: string): boolean {
  return /\d{2}:\d{2}/.test(dueLocal);
}

/** 締切の瞬間 (UTC)。日付だけの場合は、その timezone での 23:59:59 */
export function dueInstant(dueLocal: string, timezone: string): Date | null {
  const m = dueLocal.match(DUE);
  if (!m || !isDueLocal(dueLocal)) return null;
  const timed = m[4] !== undefined;
  const offset = tzOffsetMinutes(timezone) ?? -720;
  const utc = Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    timed ? Number(m[4]) : 23, timed ? Number(m[5]) : 59, timed ? Number(m[6] ?? 0) : 59,
  );
  return new Date(utc - offset * 60000);
}

/** `YYYY-MM-DD` として正しい日付か */
export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && isDueLocal(s);
}

/** 日付 (と時刻) を years 年ずらす。2 月 29 日は 2 月 28 日にする */
export function shiftYears(local: string, years: number): string {
  const m = local.match(DUE);
  if (!m) return local;
  const y = Number(m[1]) + years;
  let d = Number(m[3]);
  const mo = Number(m[2]);
  if (mo === 2 && d === 29 && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1) d = 28;
  const rest = local.slice(10);
  return `${y}-${pad(mo)}-${pad(d)}${rest}`;
}

/* ---------- 開催日の表記 ---------- */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const monthOf = (s: string): number | undefined => MONTHS[s.toLowerCase().replace(/\.$/, '').slice(0, s.toLowerCase().startsWith('sept') ? 4 : 3)];
const iso = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

/**
 * 「Oct 12-16, 2026」「November 2-4, 2021」「June 30 - July 2, 2025」「May 5, 2025」などを読む。
 * 読めない表記は null (表記そのものは dateText として残す)。
 */
export function parseDateRange(text: string, fallbackYear?: number): { start: string; end: string } | null {
  const s = text.replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const written = s.match(/\b(19|20)\d{2}\b/)?.[0];
  const year = Number(written ?? fallbackYear ?? NaN);
  if (!Number.isInteger(year)) return null;
  const body = s.replace(/,?\s*\b(19|20)\d{2}\b/, '').trim();
  // 月 日 - 月 日
  let m = body.match(/^([A-Za-z]+)\.? (\d{1,2})(?:st|nd|rd|th)? ?- ?([A-Za-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?$/);
  if (m) {
    const [m1, m2] = [monthOf(m[1]!), monthOf(m[3]!)];
    if (!m1 || !m2) return null;
    // 年をまたぐ開催 (12 月 - 1 月)。書かれている年は終わりの日のもの。年が書かれていない場合は、開催の年を始まりの年とする
    const crosses = m2 < m1;
    const start = iso(crosses && written ? year - 1 : year, m1, Number(m[2]));
    const end = iso(crosses && !written ? year + 1 : year, m2, Number(m[4]));
    return isIsoDate(start) && isIsoDate(end) ? { start, end } : null;
  }
  // 月 日 - 日
  m = body.match(/^([A-Za-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?: ?- ?(\d{1,2})(?:st|nd|rd|th)?)?$/);
  if (m) {
    const mo = monthOf(m[1]!);
    if (!mo) return null;
    const start = iso(year, mo, Number(m[2]));
    const end = iso(year, mo, Number(m[3] ?? m[2]));
    return isIsoDate(start) && isIsoDate(end) && end >= start ? { start, end } : null;
  }
  // 日 - 日 月
  m = body.match(/^(\d{1,2})(?: ?- ?(\d{1,2}))? ([A-Za-z]+)\.?$/);
  if (m) {
    const mo = monthOf(m[3]!);
    if (!mo) return null;
    const start = iso(year, mo, Number(m[1]));
    const end = iso(year, mo, Number(m[2] ?? m[1]));
    return isIsoDate(start) && isIsoDate(end) && end >= start ? { start, end } : null;
  }
  return null;
}

/* ---------- 年ごとのサイト ---------- */

/**
 * 前年のサイトの URL から、次の年のサイトの候補を作る。
 * 4 桁の年 (2026 → 2027) と、名前に続く 2 桁の年 (imc26 → imc27、sp-26 → sp-27) を置き換える。
 * 候補が実在するかは、呼び出し側が取得して確かめる。
 */
export function nextYearUrls(url: string, fromYear: number, toYear: number): string[] {
  if (!/^https?:\/\//i.test(url)) return [];
  const out = new Set<string>();
  const full = String(fromYear);
  const short = full.slice(2);
  const toFull = String(toYear);
  const toShort = toFull.slice(2);
  if (url.includes(full)) out.add(url.split(full).join(toFull));
  // 2 桁の年は、英字や区切りの直後にあり、直後に数字が続かないものだけ (ポート番号や別の数字を避ける)
  const two = new RegExp(`(?<=[A-Za-z/_\\-.])${short}(?![0-9])`, 'g');
  const origin = url.match(/^https?:\/\/[^/]+/i)?.[0] ?? '';
  const replaced = origin + url.slice(origin.length).replace(two, toShort);
  const host = origin.replace(two, toShort) + url.slice(origin.length);
  if (!url.includes(full)) {
    if (replaced !== url) out.add(replaced);
    if (host !== url) out.add(host);
    const both = origin.replace(two, toShort) + url.slice(origin.length).replace(two, toShort);
    if (both !== url) out.add(both);
  }
  out.delete(url);
  return [...out];
}

/** 前年の開催から、次の年の開催を「予想」として作る */
export function estimateNext(prev: VenueEdition, toYear: number): EditionInput {
  const by = toYear - prev.year;
  const shift = (s: string): string => (s ? shiftYears(s, by) : '');
  return {
    year: toYear, label: prev.label, siteUrl: '', place: '', dateText: '',
    startDate: shift(prev.startDate), endDate: shift(prev.endDate),
    estimated: true, source: 'estimate', note: '',
    deadlines: prev.deadlines.map((d) => ({
      kind: d.kind, label: d.label, dueLocal: shiftYears(d.dueLocal, by), timezone: d.timezone, estimated: true, source: 'estimate',
    })),
  };
}

/* ---------- 一覧用 ---------- */

export interface UpcomingDeadline {
  venue: Venue;
  edition: VenueEdition;
  deadline: VenueDeadline;
  at: Date;
}

/** これから来る締切を、近い順に並べる (アーカイブした会議は除く) */
export function upcomingDeadlines(venues: readonly Venue[], now: Date): UpcomingDeadline[] {
  const out: UpcomingDeadline[] = [];
  for (const venue of venues) {
    if (venue.archived) continue;
    for (const edition of venue.editions) {
      for (const deadline of edition.deadlines) {
        const at = dueInstant(deadline.dueLocal, deadline.timezone);
        if (at && at.getTime() >= now.getTime()) out.push({ venue, edition, deadline, at });
      }
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime() || a.venue.id - b.venue.id || a.deadline.id - b.deadline.id);
}

/** 締切までの残り日数 (切り上げ)。過ぎていれば負の数 */
export function daysUntil(at: Date, now: Date): number {
  // `|| 0` は -0 を 0 にするため
  return Math.ceil((at.getTime() - now.getTime()) / 86400000) || 0;
}

/** 表示名。略称があれば略称、無ければ正式名 */
export function venueTitle(v: Pick<Venue, 'acronym' | 'name'>): string {
  return v.acronym.trim() || v.name.trim();
}

export function editionTitle(v: Pick<Venue, 'acronym' | 'name'>, e: Pick<VenueEdition, 'year' | 'label'>): string {
  return [venueTitle(v), String(e.year), e.label.trim()].filter(Boolean).join(' ');
}
