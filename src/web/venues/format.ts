import { hasTime, isIsoDate, type Venue, type VenueDeadline, type VenueEdition } from '../../shared/venues';
import type { Entry } from '../../shared/types';
import { matcher, venueTextOf } from './match';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const pad = (n: number): string => String(n).padStart(2, '0');

/** 締切の瞬間を、見ている人の地域の日時で表す (例: 5/16 (土) 20:59) */
export function localWhen(at: Date, withYear: boolean): string {
  const date = `${withYear ? at.getFullYear() + '/' : ''}${at.getMonth() + 1}/${at.getDate()} (${WEEK[at.getDay()]})`;
  return `${date} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** 元の表記 (会議のサイトに書かれている日時) */
export function originalWhen(d: Pick<VenueDeadline, 'dueLocal' | 'timezone'>): string {
  return `${d.dueLocal}${hasTime(d.dueLocal) ? '' : ' (終日)'} ${d.timezone}`;
}

export function remaining(days: number): string {
  if (days < 0) return '終了';
  if (days === 0) return '今日';
  if (days === 1) return '明日';
  if (days < 60) return `あと ${days} 日`;
  return `あと約 ${Math.round(days / 30)} か月`;
}

/** 残り日数に応じた強調 (2 週間以内、2 か月以内、それ以降) */
export function urgency(days: number): 'soon' | 'near' | 'far' {
  return days <= 14 ? 'soon' : days <= 60 ? 'near' : 'far';
}

export function editionDates(e: Pick<VenueEdition, 'startDate' | 'endDate' | 'dateText'>): string {
  if (!e.startDate) return e.dateText;
  const [y, m, d] = e.startDate.split('-').map(Number) as [number, number, number];
  if (!e.endDate || e.endDate === e.startDate) return `${y}/${m}/${d}`;
  const [y2, m2, d2] = e.endDate.split('-').map(Number) as [number, number, number];
  return `${y}/${m}/${d} 〜 ${y2 !== y ? y2 + '/' : ''}${m2 !== m || y2 !== y ? m2 + '/' : ''}${d2}`;
}

/** これから始まるか、開催中の開催のうち、最も近いもの。today は見ている人の地域の日付 (YYYY-MM-DD) */
export function nextHeld(venue: Pick<Venue, 'editions'>, today: string): VenueEdition | null {
  // 終了日が開催日より前の場合は、開催日だけを使う (カレンダーと同じ扱い)
  const coming = venue.editions.filter((e) => isIsoDate(e.startDate) && (isIsoDate(e.endDate) && e.endDate >= e.startDate ? e.endDate : e.startDate) >= today);
  return coming.sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
}

/**
 * 台帳の論文のうち、この会議・論文誌のもの。
 * 追加の画面の候補と同じ規則で照合する (件数が画面によって変わらないように)。
 */
export function entriesOf(venue: Pick<Venue, 'acronym' | 'name'>, entries: readonly Entry[]): Entry[] {
  const test = matcher(venue);
  return entries.filter((e) => {
    const t = venueTextOf(e);
    return t !== null && test(t);
  });
}
