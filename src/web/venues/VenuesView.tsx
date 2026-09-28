import { useMemo, useState } from 'react';
import { daysUntil, upcomingDeadlines, VENUE_KIND_LABELS, venueTitle, type Venue } from '../../shared/venues';
import { useAppData } from '../state/AppDataContext';
import { CalendarDialog } from './CalendarDialog';
import { DeadlineTimeline } from './DeadlineTimeline';
import { EditionDialog, type EditionTarget } from './EditionDialog';
import { entriesOf, remaining } from './format';
import { ImportDialog } from './ImportDialog';
import { VenueDialog } from './VenueDialog';
import { VenuePanel } from './VenuePanel';
import { useVenues, VenuesProvider } from './VenuesContext';

type Dialog =
  | { kind: 'none' }
  | { kind: 'venue'; venue: Venue | null }
  | { kind: 'edition'; target: EditionTarget }
  | { kind: 'import' }
  | { kind: 'calendar' };

/** 会議・論文誌の区画 (#/venues)。論文の台帳とは別に読み込む */
export function VenuesView() {
  return (
    <VenuesProvider>
      <VenuesInner />
    </VenuesProvider>
  );
}

function VenuesInner() {
  const { data } = useVenues();
  const { data: library } = useAppData();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
  const [showArchived, setShowArchived] = useState(false);
  // 残り日数は、読み込んだ時点を基準にする (開いている間に順序が入れ替わらないように)
  const now = useMemo(() => new Date(), [data]);
  const upcoming = useMemo(() => upcomingDeadlines(data.venues, now), [data.venues, now]);
  const active = data.venues.filter((v) => !v.archived);
  const archived = data.venues.filter((v) => v.archived);
  const selected = data.venues.find((v) => v.id === selectedId) ?? null;
  const close = () => setDialog({ kind: 'none' });

  const nextOf = (v: Venue) => upcoming.find((u) => u.venue.id === v.id);
  const row = (v: Venue) => {
    const next = nextOf(v);
    const papers = entriesOf(v, library.entries).length;
    return (
      <li key={v.id}>
        <button type="button" className={'vn-row' + (v.id === selectedId ? ' on' : '')} aria-pressed={v.id === selectedId}
          onClick={() => setSelectedId(v.id === selectedId ? null : v.id)}>
          <span className="vn-row-main">
            <span className="vn-acr">{venueTitle(v)}</span>
            {v.acronym && v.name !== v.acronym && <span className="vn-name">{v.name}</span>}
          </span>
          <span className="vn-row-meta">
            {v.kind === 'journal' && <span className="pill">{VENUE_KIND_LABELS.journal}</span>}
            {v.core && <span className="pill rank-a">CORE {v.core}</span>}
            {v.impactFactor && <span className="pill if">IF {v.impactFactor}</span>}
            {papers > 0 && <span className="vn-papers" title="台帳にある、この会議・論文誌の論文">台帳 {papers}</span>}
            <span className="vn-next">{next ? remaining(daysUntil(next.at, now)) : '締切なし'}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="venues">
      <div className="vn-main">
        <div className="lib-tools">
          <span className="vn-lead">追跡している会議・論文誌の締切と開催日を、近い順に並べます。</span>
          <div className="lib-tools-right">
            <button type="button" className="hbtn" onClick={() => setDialog({ kind: 'calendar' })}>カレンダーに出力</button>
            <button type="button" className="hbtn" onClick={() => setDialog({ kind: 'import' })}>公開データから追加</button>
            <button type="button" className="hbtn primary" onClick={() => setDialog({ kind: 'venue', venue: null })}>+ 手入力で追加</button>
          </div>
        </div>

        {!data.venues.length ? (
          <div className="empty">
            まだ会議・論文誌がありません
            <div className="empty-actions">
              <button type="button" className="hbtn primary" onClick={() => setDialog({ kind: 'import' })}>公開データから追加</button>
            </div>
            <div className="empty-note">IMC、SIGCOMM、NSDI、NDSS、USENIX Security などは、公開データから締切ごと取り込めます。</div>
          </div>
        ) : (
          <>
            <section aria-label="これからの締切">
              <h2 className="vn-h">これからの締切</h2>
              <DeadlineTimeline items={upcoming} now={now} onOpen={(id) => setSelectedId(id)} />
            </section>

            <section aria-label="会議・論文誌">
              <h2 className="vn-h">会議・論文誌 <span className="vn-h-n">{active.length}</span></h2>
              <ul className="vn-list">{active.map(row)}</ul>
              {archived.length > 0 && (
                <>
                  <button type="button" className="linkbtn vn-archived" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>
                    {showArchived ? 'アーカイブを閉じる' : `アーカイブを表示 (${archived.length})`}
                  </button>
                  {showArchived && <ul className="vn-list">{archived.map(row)}</ul>}
                </>
              )}
            </section>
          </>
        )}
      </div>

      {selected && (
        <VenuePanel venue={selected} now={now} onClose={() => setSelectedId(null)}
          onEditVenue={() => setDialog({ kind: 'venue', venue: selected })}
          onEdition={(target) => setDialog({ kind: 'edition', target })} />
      )}

      <VenueDialog open={dialog.kind === 'venue'} venue={dialog.kind === 'venue' ? dialog.venue : null} onClose={close}
        onSaved={(id) => { close(); setSelectedId(id); }} />
      <EditionDialog open={dialog.kind === 'edition'} target={dialog.kind === 'edition' ? dialog.target : null} onClose={close} />
      <ImportDialog open={dialog.kind === 'import'} onClose={close} onImported={(id) => setSelectedId(id)} />
      <CalendarDialog open={dialog.kind === 'calendar'} onClose={close} />
    </div>
  );
}
