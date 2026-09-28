import { useMemo } from 'react';
import {
  daysUntil, DEADLINE_LABELS, editionTitle, upcomingDeadlines, VENUE_KIND_LABELS, venueTitle,
  type UpcomingDeadline, type Venue, type VenueKind,
} from '../../../shared/venues';
import { urgency } from '../../venues/format';
import { useVenueStore } from '../../venues/VenuesContext';

const SOON_MAX = 4;

/** サイドバー用の短い表記 (12 日、7 か月) */
function shortLeft(days: number): string {
  if (days <= 0) return '今日';
  if (days === 1) return '明日';
  return days < 60 ? `${days} 日` : `${Math.round(days / 30)} か月`;
}

const deadlineName = (u: UpcomingDeadline): string =>
  (u.deadline.kind === 'other' && u.deadline.label ? u.deadline.label : DEADLINE_LABELS[u.deadline.kind]);

/** 国際会議・論文誌を開いているときのサイドバー。近い締切と、追跡しているものの一覧を出す */
export function VenuesSide({ kind }: { kind: VenueKind }) {
  const { data, error, selectedId, select } = useVenueStore();
  const venues = useMemo(() => (data?.venues ?? []).filter((v) => v.kind === kind), [data, kind]);
  const now = useMemo(() => new Date(), [data]);
  const upcoming = useMemo(() => upcomingDeadlines(venues, now), [venues, now]);
  const active = venues.filter((v) => !v.archived);
  const archived = venues.filter((v) => v.archived);
  const toggle = (id: number) => select(id === selectedId ? null : id);

  const item = (v: Venue) => {
    const next = upcoming.find((u) => u.venue.id === v.id);
    const days = next ? daysUntil(next.at, now) : null;
    const tone = days === null ? 'none' : urgency(days);
    const right = days !== null ? shortLeft(days) : kind === 'journal' && v.impactFactor ? `IF ${v.impactFactor}` : '';
    return (
      <div className="side-row" key={v.id}>
        <button type="button" className={'side-item side-venue' + (v.id === selectedId ? ' on' : '')} aria-pressed={v.id === selectedId}
          title={v.name} onClick={() => toggle(v.id)}>
          <span className="lbl">
            <span className={`side-mark ${tone}`} aria-hidden="true" />
            <span>{venueTitle(v)}</span>
          </span>
          {right && <span className={`n ${tone}`}>{right}</span>}
        </button>
      </div>
    );
  };

  if (!data) return <div className="side-note side-ledger-note">{error ? '読み込めませんでした。右の「再読み込み」を押してください。' : '読み込んでいます…'}</div>;
  return (
    <>
      {upcoming.length > 0 && (
        <>
          <h3>近い締切</h3>
          <ol className="side-due">
            {upcoming.slice(0, SOON_MAX).map((u) => {
              const days = daysUntil(u.at, now);
              return (
                <li key={`${u.edition.id}-${u.deadline.id}`}>
                  <button type="button" className={'side-due-item ' + urgency(days)} onClick={() => select(u.venue.id)}>
                    <span className="side-due-left">{shortLeft(days)}</span>
                    <span className="side-due-body">
                      <span className="side-due-title">{editionTitle(u.venue, u.edition)}</span>
                      <span className="side-due-kind">{deadlineName(u)}{u.deadline.estimated ? ' (予想)' : ''}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <h3 className="side-h">{VENUE_KIND_LABELS[kind]}<span className="side-h-n">{active.length}</span></h3>
      {!active.length && (
        <div className="side-note">
          {kind === 'journal' ? '「検索して追加」から、投稿先の論文誌を登録します' : '「公開データから追加」から、追跡する会議を登録します'}
        </div>
      )}
      {active.map(item)}
      {archived.length > 0 && (
        <details className="side-archived">
          <summary>アーカイブ ({archived.length})</summary>
          {archived.map(item)}
        </details>
      )}
    </>
  );
}
