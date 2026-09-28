import { daysUntil, DEADLINE_LABELS, VENUE_KIND_LABELS, venueTitle, type UpcomingDeadline, type Venue } from '../../shared/venues';
import { editionDates, localWhen, nextHeld, remaining, urgency } from './format';

interface Props {
  venue: Venue;
  next: UpcomingDeadline | undefined;
  papers: number;
  now: Date;
  today: string;
  selected: boolean;
  onSelect: () => void;
}

/** 一覧の 1 行。次の締切と次の開催を、名前の下に並べる */
export function VenueRow({ venue: v, next, papers, now, today, selected, onSelect }: Props) {
  const held = nextHeld(v, today);
  const days = next ? daysUntil(next.at, now) : 0;
  const label = next ? (next.deadline.kind === 'other' && next.deadline.label ? next.deadline.label : DEADLINE_LABELS[next.deadline.kind]) : '締切';
  return (
    <button type="button" className={'vn-row' + (selected ? ' on' : '')} aria-pressed={selected} onClick={onSelect}>
      <span className="vn-row-top">
        <span className="vn-row-main">
          <span className="vn-acr">{venueTitle(v)}</span>
          {v.acronym && v.name !== v.acronym && <span className="vn-name">{v.name}</span>}
        </span>
        <span className="vn-row-meta">
          {v.kind === 'journal' && <span className="pill">{VENUE_KIND_LABELS.journal}</span>}
          {v.core && <span className="pill rank-a">CORE {v.core}</span>}
          {v.impactFactor && <span className="pill if">IF {v.impactFactor}</span>}
          {papers > 0 && <span className="vn-papers" title="台帳にある、この会議・論文誌の論文">台帳 {papers}</span>}
        </span>
      </span>
      <span className="vn-facts">
        <span className={'vn-fact' + (next ? ' ' + urgency(days) : ' none')}>
          <span className="vn-fact-k">{label}</span>
          {next ? (
            <>
              <span className="vn-fact-v">{localWhen(next.at, next.at.getFullYear() !== now.getFullYear())}</span>
              <span className="vn-fact-left">{remaining(days)}</span>
              {next.deadline.estimated && <span className="vn-guess">予想</span>}
            </>
          ) : <span className="vn-fact-v">これからの締切は未登録</span>}
        </span>
        <span className={'vn-fact' + (held ? '' : ' none')}>
          <span className="vn-fact-k">開催</span>
          {held ? (
            <>
              <span className="vn-fact-v">{editionDates(held)}</span>
              {held.place && <span className="vn-fact-place">{held.place}</span>}
              {held.estimated && <span className="vn-guess">予想</span>}
            </>
          ) : <span className="vn-fact-v">{v.kind === 'journal' ? '随時' : '次の開催日は未登録'}</span>}
        </span>
      </span>
    </button>
  );
}
