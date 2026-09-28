import { daysUntil, editionTitle, venueTitle, type UpcomingDeadline, type Venue } from '../../shared/venues';
import { localWhen, remaining, urgency } from './format';

interface Props {
  venue: Venue;
  next: UpcomingDeadline | undefined;
  papers: number;
  now: Date;
  selected: boolean;
  onSelect: () => void;
}

/** 論文誌の一覧の 1 行。出版社と査読期間、特集号の締切を並べる */
export function JournalRow({ venue: v, next, papers, now, selected, onSelect }: Props) {
  const days = next ? daysUntil(next.at, now) : 0;
  return (
    <button type="button" className={'vn-row' + (selected ? ' on' : '')} aria-pressed={selected} onClick={onSelect}>
      <span className="vn-row-top">
        <span className="vn-row-main">
          <span className="vn-acr">{venueTitle(v)}</span>
          {v.acronym && v.name !== v.acronym && <span className="vn-name">{v.name}</span>}
        </span>
        <span className="vn-row-meta">
          {v.org && <span>{v.org}</span>}
          {v.impactFactor && <span className="pill if">IF {v.impactFactor}</span>}
          {papers > 0 && <span className="vn-papers" title="台帳にある、この論文誌の論文">台帳 {papers}</span>}
        </span>
      </span>
      <span className="vn-facts">
        <span className={'vn-fact' + (v.reviewTime ? '' : ' none')}>
          <span className="vn-fact-k">査読期間</span>
          <span className="vn-fact-v">{v.reviewTime || '未登録'}</span>
        </span>
        <span className={'vn-fact' + (next ? ' ' + urgency(days) : ' none')}>
          <span className="vn-fact-k">特集号</span>
          {next ? (
            <>
              <span className="vn-fact-v">{localWhen(next.at, next.at.getFullYear() !== now.getFullYear())}</span>
              <span className="vn-fact-left">{remaining(days)}</span>
              <span className="vn-fact-place">{next.edition.label || editionTitle(v, next.edition)}</span>
            </>
          ) : <span className="vn-fact-v">募集中のものは未登録</span>}
        </span>
      </span>
    </button>
  );
}
