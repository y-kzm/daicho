import { DEADLINE_LABELS, dueInstant, editionTitle, hasTime, isIsoDate, type Venue } from '../../shared/venues';

const pad = (n: number): string => String(n).padStart(2, '0');

/** 文字列の値に使えない文字を置き換える (RFC 5545 3.3.11) */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** 1 行を 75 オクテット以下に折り返す。UTF-8 の文字の途中では切らない */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    // 2 行目以降は先頭に空白 1 つが付くので、その分を引く
    if (size + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const utcStamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const dateStamp = (iso: string): string => iso.slice(0, 10).replace(/-/g, '');

function nextDay(iso: string): string {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + 1));
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);

export interface IcsOptions {
  now: Date;
  /** 予想の日付を含めるか */
  includeEstimated: boolean;
  /** これより前に終わった予定は出さない */
  since: Date;
}

interface Event { uid: string; summary: string; description: string; location: string; url: string; start: string; end: string }

function event(e: Event, stamp: string): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${e.uid}@daicho`,
    `DTSTAMP:${stamp}`,
    e.start,
    e.end,
    `SUMMARY:${icsText(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.url ? [`URL:${icsText(e.url)}`] : []),
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

/**
 * 締切と開催日を iCalendar にする。
 * 時刻のある締切は、締切の 1 時間前から締切までの予定にする (締切の瞬間がカレンダー上の終わりになる)。
 * 日付だけの締切と開催日は、終日の予定にする。
 */
export function buildIcs(venues: readonly Venue[], opts: IcsOptions): string {
  const stamp = utcStamp(opts.now);
  const lines: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Daicho//Venues//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText('Daicho 会議と締切')}`,
  ];
  const guess = (estimated: boolean): string => (estimated ? ' (予想)' : '');
  for (const v of venues) {
    if (v.archived) continue;
    for (const ed of v.editions) {
      const title = editionTitle(v, ed);
      const url = ed.siteUrl || v.siteUrl;
      if (isIsoDate(ed.startDate) && (opts.includeEstimated || !ed.estimated)) {
        const end = isIsoDate(ed.endDate) && ed.endDate >= ed.startDate ? ed.endDate : ed.startDate;
        if (new Date(end + 'T23:59:59Z') >= opts.since) {
          lines.push(...event({
            uid: `e${ed.id}-dates`, summary: `${title} 開催${guess(ed.estimated)}`,
            description: [v.name, ed.dateText].filter(Boolean).join('\n'), location: ed.place, url,
            start: `DTSTART;VALUE=DATE:${dateStamp(ed.startDate)}`, end: `DTEND;VALUE=DATE:${nextDay(end)}`,
          }, stamp));
        }
      }
      const seen = new Map<string, number>();
      for (const d of ed.deadlines) {
        const key = `${d.kind}-${slug(d.label)}`;
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        const at = dueInstant(d.dueLocal, d.timezone);
        if (!at || at < opts.since || (d.estimated && !opts.includeEstimated)) continue;
        const name = d.kind === 'other' && d.label ? d.label : DEADLINE_LABELS[d.kind] + (d.label ? ` (${d.label})` : '');
        const timed = hasTime(d.dueLocal);
        lines.push(...event({
          uid: `e${ed.id}-${key}-${n}`, summary: `${title} ${name}${guess(d.estimated)}`,
          description: [`締切: ${d.dueLocal} ${d.timezone}`, v.name].join('\n'), location: '', url,
          start: timed ? `DTSTART:${utcStamp(new Date(at.getTime() - 3600000))}` : `DTSTART;VALUE=DATE:${dateStamp(d.dueLocal)}`,
          end: timed ? `DTEND:${utcStamp(at)}` : `DTEND;VALUE=DATE:${nextDay(d.dueLocal)}`,
        }, stamp));
      }
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
