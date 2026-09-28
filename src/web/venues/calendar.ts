import { DEADLINE_LABELS, dueInstant, editionTitle, isIsoDate, venueTitle, type Venue } from '../../shared/venues';

/** カレンダーに置く 1 件。締切は 1 日、開催は期間 */
export interface CalItem {
  key: string;
  venueId: number;
  kind: 'deadline' | 'held';
  title: string;
  /** マスの中に出す短い名前 (年を省く) */
  short: string;
  /** 見ている人の地域の日付 (YYYY-MM-DD) */
  start: string;
  end: string;
  estimated: boolean;
  /** 締切の瞬間 (締切のみ) */
  at: Date | null;
}

/** 1 週間の中での置き場所。from と to は列 (0 が月曜)、lane は上からの段 */
export interface Segment { item: CalItem; from: number; to: number; lane: number; before: boolean; after: boolean }

const pad = (n: number): string => String(n).padStart(2, '0');

export function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 月を 1 から 12 の範囲に収める (13 月は翌年の 1 月) */
export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const n = year * 12 + (month - 1) + by;
  return { year: Math.floor(n / 12), month: (n % 12 + 12) % 12 + 1 };
}

/** その月を含む週を、月曜始まりで並べる */
export function monthWeeks(year: number, month: number): string[][] {
  const first = `${year}-${pad(month)}-01`;
  const last = addDays(`${shiftMonth(year, month, 1).year}-${pad(shiftMonth(year, month, 1).month)}-01`, -1);
  const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weeks: string[][] = [];
  for (let day = addDays(first, -dow); day <= last; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
  }
  return weeks;
}

/**
 * 締切と開催を、カレンダーに置く形にする。
 * 締切は、見ている人の地域の日付に置く (AoE の 23:59 は、日本では翌日の 20:59)。
 */
export function calendarItems(venues: readonly Venue[], toIso: (d: Date) => string = localIso): CalItem[] {
  const out: CalItem[] = [];
  for (const v of venues) {
    if (v.archived) continue;
    for (const e of v.editions) {
      const name = editionTitle(v, e);
      if (isIsoDate(e.startDate)) {
        const end = isIsoDate(e.endDate) && e.endDate >= e.startDate ? e.endDate : e.startDate;
        out.push({ key: `e${e.id}`, venueId: v.id, kind: 'held', title: `${name} 開催`, short: `${venueTitle(v)} 開催`, start: e.startDate, end, estimated: e.estimated, at: null });
      }
      for (const d of e.deadlines) {
        const at = dueInstant(d.dueLocal, d.timezone);
        if (!at) continue;
        const label = d.kind === 'other' && d.label ? d.label : DEADLINE_LABELS[d.kind];
        const day = toIso(at);
        out.push({ key: `d${d.id}`, venueId: v.id, kind: 'deadline', title: `${name} ${label}`, short: `${venueTitle(v)} ${label}`, start: day, end: day, estimated: d.estimated, at });
      }
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || (a.kind === b.kind ? 0 : a.kind === 'deadline' ? -1 : 1)
    || (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0) || a.key.localeCompare(b.key));
}

export function itemsBetween(items: readonly CalItem[], from: string, to: string): CalItem[] {
  return items.filter((it) => it.start <= to && it.end >= from);
}

/** 1 週間ぶんの置き場所を決める。期間の長いものを上の段に置き、重ならない段に詰める */
export function layoutWeek(week: readonly string[], items: readonly CalItem[]): Segment[] {
  const [from, to] = [week[0]!, week[6]!];
  const inWeek = itemsBetween(items, from, to).map((item) => ({
    item,
    from: item.start < from ? 0 : week.indexOf(item.start),
    to: item.end > to ? 6 : week.indexOf(item.end),
    before: item.start < from,
    after: item.end > to,
  }));
  inWeek.sort((a, b) => (b.to - b.from) - (a.to - a.from) || a.from - b.from || a.item.key.localeCompare(b.item.key));
  const lanes: boolean[][] = [];
  return inWeek.map((s) => {
    let lane = lanes.findIndex((used) => !used.slice(s.from, s.to + 1).some(Boolean));
    if (lane === -1) lane = lanes.push(Array<boolean>(7).fill(false)) - 1;
    for (let c = s.from; c <= s.to; c++) lanes[lane]![c] = true;
    return { ...s, lane };
  });
}
