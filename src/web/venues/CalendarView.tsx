import { useMemo, useState } from 'react';
import { daysUntil, type Venue } from '../../shared/venues';
import { calendarItems, itemsBetween, layoutWeek, localIso, monthWeeks, shiftMonth, type CalItem } from './calendar';
import { localWhen, remaining, urgency } from './format';

interface Props { venues: readonly Venue[]; now: Date; onOpen: (venueId: number) => void }

const DAYS = ['月', '火', '水', '木', '金', '土', '日'];
const MIN_LANES = 3;

const md = (iso: string): string => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/** 月のカレンダー。締切はその日に、開催は期間の帯で置く */
export function CalendarView({ venues, now, onOpen }: Props) {
  const today = localIso(now);
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const items = useMemo(() => calendarItems(venues), [venues]);
  const weeks = useMemo(() => monthWeeks(ym.year, ym.month), [ym]);
  const prefix = `${ym.year}-${String(ym.month).padStart(2, '0')}`;
  const inMonth = itemsBetween(items, `${prefix}-01`, `${prefix}-31`);
  const move = (by: number) => setYm((s) => shiftMonth(s.year, s.month, by));

  const tone = (it: CalItem): string => {
    if (it.kind === 'held') return it.end < today ? 'past' : '';
    const days = it.at ? daysUntil(it.at, now) : -1;
    return days < 0 ? 'past' : urgency(days);
  };
  const describe = (it: CalItem): string => (it.kind === 'deadline' && it.at
    ? `${it.title} ${localWhen(it.at, true)} まで${it.estimated ? ' (予想)' : ''}`
    : `${it.title} ${md(it.start)}${it.end !== it.start ? ` 〜 ${md(it.end)}` : ''}${it.estimated ? ' (予想)' : ''}`);

  return (
    <div className="vc">
      <div className="vc-head">
        <h2 className="vc-month" aria-live="polite">{ym.year} 年 {ym.month} 月</h2>
        <div className="vc-nav">
          <button type="button" className="sbtn" aria-label="前の月" onClick={() => move(-1)}>‹</button>
          <button type="button" className="sbtn" onClick={() => setYm({ year: now.getFullYear(), month: now.getMonth() + 1 })}>今日</button>
          <button type="button" className="sbtn" aria-label="次の月" onClick={() => move(1)}>›</button>
        </div>
        <div className="vc-legend" aria-hidden="true">
          <span className="vc-key deadline">締切</span>
          <span className="vc-key held">開催</span>
          <span className="vc-key guess">予想</span>
        </div>
      </div>

      <div className="vc-grid">
        <div className="vc-dow" aria-hidden="true">{DAYS.map((d) => <span key={d}>{d}</span>)}</div>
        {weeks.map((week) => {
          const segs = layoutWeek(week, items);
          const lanes = Math.max(MIN_LANES, ...segs.map((s) => s.lane + 1));
          return (
            <div key={week[0]} className="vc-week" style={{ gridTemplateRows: `28px repeat(${lanes}, 24px)` }}>
              {week.map((day, i) => (
                <div key={day} className={'vc-day' + (day.startsWith(prefix) ? '' : ' out') + (day === today ? ' today' : '')}
                  style={{ gridColumn: i + 1, gridRow: `1 / span ${lanes + 1}` }}>
                  <span className="vc-num">{Number(day.slice(8, 10)) === 1 ? md(day) : Number(day.slice(8, 10))}</span>
                </div>
              ))}
              {segs.map((s) => (
                <button key={s.item.key} type="button" title={describe(s.item)} aria-label={describe(s.item)}
                  className={`vc-item ${s.item.kind} ${tone(s.item)}${s.item.estimated ? ' guess' : ''}${s.before ? ' cut-l' : ''}${s.after ? ' cut-r' : ''}`}
                  style={{ gridColumn: `${s.from + 1} / ${s.to + 2}`, gridRow: s.lane + 2 }}
                  onClick={() => onOpen(s.item.venueId)}>
                  {s.item.short}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* 狭い画面では、マスの代わりに日付順の一覧を見せる */}
      <ol className="vc-agenda">
        {inMonth.map((it) => (
          <li key={it.key}>
            <button type="button" className={`vc-row ${it.kind} ${tone(it)}`} onClick={() => onOpen(it.venueId)}>
              <span className="vc-row-day">{md(it.start)}{it.end !== it.start ? ` 〜 ${md(it.end)}` : ''}</span>
              <span className="vc-row-title">
                {it.title}
                {it.estimated && <span className="vn-guess">予想</span>}
              </span>
              {it.kind === 'deadline' && it.at && <span className="vc-row-left">{remaining(daysUntil(it.at, now))}</span>}
            </button>
          </li>
        ))}
        {!inMonth.length && <li className="vn-none">この月の締切と開催は、登録されていません。</li>}
      </ol>
    </div>
  );
}
