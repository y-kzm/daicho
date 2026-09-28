import {
  DEADLINE_KINDS, DEADLINES_MAX, EDITIONS_MAX, isDueLocal, isIsoDate, tzOffsetMinutes, VENUE_KINDS, VENUE_SOURCES,
  type DeadlineInput, type DeadlineKind, type EditionInput, type VenueImport, type VenueInput, type VenueKind, type VenueSource,
} from '../../shared/venues';
import { AppError } from '../errors';
import { str } from '../validate';

const TEXT_MAX = 300;
const NOTE_MAX = 4000;
const URL_MAX = 500;

const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function text(v: unknown, max = TEXT_MAX): string {
  return str(v).slice(0, max);
}

/** 空か、http(s) の URL だけを受け付ける (画面でリンクにするため) */
export function webUrl(v: unknown, what: string): string {
  const s = str(v);
  if (!s) return '';
  if (s.length > URL_MAX || !/^https?:\/\/[^\s]+$/i.test(s)) throw new AppError(`${what}は http または https で始まる URL にしてください。`);
  return s;
}

function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T | null, what: string): T {
  const s = str(v);
  if (!s && fallback !== null) return fallback;
  if (!(list as readonly string[]).includes(s)) throw new AppError(`${what}が不正です。`);
  return s as T;
}

function optDate(v: unknown, what: string): string {
  const s = str(v);
  if (s && !isIsoDate(s)) throw new AppError(`${what}は YYYY-MM-DD の形で入力してください。`);
  return s;
}

export function parseVenueInput(body: unknown): VenueInput {
  const b = obj(body);
  const name = text(b.name);
  const acronym = text(b.acronym, 60);
  if (!name && !acronym) throw new AppError('名前か略称を入力してください。');
  return {
    kind: oneOf<VenueKind>(VENUE_KINDS, b.kind, 'conference', '種類'),
    acronym,
    name: name || acronym,
    org: text(b.org, 60),
    field: text(b.field, 120),
    core: text(b.core, 20),
    impactFactor: text(b.impactFactor, 20),
    siteUrl: webUrl(b.siteUrl, 'サイトの URL'),
    note: text(b.note, NOTE_MAX),
    source: oneOf<VenueSource>(VENUE_SOURCES, b.source, 'manual', '取得元'),
    sourceKey: text(b.sourceKey, 120),
  };
}

export function parseDeadlineInput(v: unknown): DeadlineInput {
  const b = obj(v);
  const dueLocal = str(b.dueLocal).replace('T', ' ');
  if (!isDueLocal(dueLocal)) throw new AppError('締切は YYYY-MM-DD または YYYY-MM-DD HH:MM の形で入力してください。');
  const timezone = text(b.timezone, 12) || 'AoE';
  if (tzOffsetMinutes(timezone) === null) throw new AppError('タイムゾーンは AoE、UTC、UTC+9、JST のように入力してください。');
  return {
    kind: oneOf<DeadlineKind>(DEADLINE_KINDS, b.kind, null, '締切の種類'),
    label: text(b.label, 80),
    dueLocal,
    timezone,
    estimated: b.estimated === true,
    source: oneOf<VenueSource>(VENUE_SOURCES, b.source, 'manual', '取得元'),
  };
}

export function parseEditionInput(body: unknown): EditionInput {
  const b = obj(body);
  const year = typeof b.year === 'number' ? b.year : Number(str(b.year));
  if (!Number.isInteger(year) || year < 1950 || year > 2100) throw new AppError('年は 1950 から 2100 の間で入力してください。');
  const startDate = optDate(b.startDate, '開催日');
  const endDate = optDate(b.endDate, '終了日') || startDate;
  if (startDate && endDate < startDate) throw new AppError('終了日は開催日より後にしてください。');
  const list = b.deadlines === undefined || b.deadlines === null ? [] : b.deadlines;
  if (!Array.isArray(list)) throw new AppError('締切の指定が不正です。');
  if (list.length > DEADLINES_MAX) throw new AppError(`締切は 1 回の開催につき ${DEADLINES_MAX} 件までです。`);
  return {
    year,
    label: text(b.label, 120),
    siteUrl: webUrl(b.siteUrl, 'サイトの URL'),
    place: text(b.place, 120),
    dateText: text(b.dateText, 80),
    startDate,
    endDate,
    estimated: b.estimated === true,
    source: oneOf<VenueSource>(VENUE_SOURCES, b.source, 'manual', '取得元'),
    note: text(b.note, NOTE_MAX),
    deadlines: list.map(parseDeadlineInput),
  };
}

export function parseVenueImport(body: unknown): VenueImport {
  const b = obj(body);
  const venue = parseVenueInput(b.venue);
  if (venue.source === 'manual' || !venue.sourceKey) throw new AppError('取り込むデータの取得元が不正です。');
  if (!Array.isArray(b.editions)) throw new AppError('取り込むデータが不正です。');
  if (b.editions.length > EDITIONS_MAX) throw new AppError(`一度に取り込める開催は ${EDITIONS_MAX} 件までです。`);
  const editions = b.editions.map(parseEditionInput);
  const seen = new Set<string>();
  for (const e of editions) {
    const key = `${e.year}\u0000${e.label}`;
    if (seen.has(key)) throw new AppError('取り込むデータに、同じ年の開催が重複しています。');
    seen.add(key);
  }
  return { venue, editions };
}
