import { daysUntil, DEADLINE_LABELS, editionTitle, type UpcomingDeadline } from '../../shared/venues';
import { localWhen, originalWhen, remaining, urgency } from './format';

interface Props { items: UpcomingDeadline[]; now: Date; onOpen: (venueId: number) => void }

const SHOWN = 12;

/** これからの締切を、近い順に並べる。残り日数で強調を変える */
export function DeadlineTimeline({ items, now, onOpen }: Props) {
  if (!items.length) return <div className="vn-none">これから来る締切は、登録されていません。</div>;
  const thisYear = now.getFullYear();
  return (
    <ol className="vn-timeline">
      {items.slice(0, SHOWN).map((u) => {
        const days = daysUntil(u.at, now);
        const name = u.deadline.kind === 'other' && u.deadline.label ? u.deadline.label : DEADLINE_LABELS[u.deadline.kind];
        return (
          <li key={`${u.edition.id}-${u.deadline.id}`}>
            <button type="button" className={'vn-due ' + urgency(days)} onClick={() => onOpen(u.venue.id)}>
              <span className="vn-due-left">{remaining(days)}</span>
              <span className="vn-due-body">
                <span className="vn-due-title">
                  {editionTitle(u.venue, u.edition)} {name}
                  {u.deadline.kind !== 'other' && u.deadline.label && <span className="vn-due-label">{u.deadline.label}</span>}
                  {u.deadline.estimated && <span className="vn-guess" title="前の年から予想した日付です。サイトで確認してください">予想</span>}
                </span>
                <span className="vn-due-when" title={`元の表記: ${originalWhen(u.deadline)}`}>
                  {localWhen(u.at, u.at.getFullYear() !== thisYear)} まで
                  <span className="vn-due-orig">{originalWhen(u.deadline)}</span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
      {items.length > SHOWN && <li className="vn-none">ほか {items.length - SHOWN} 件。会議を選ぶと、すべての締切を確認できます。</li>}
    </ol>
  );
}
