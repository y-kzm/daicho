import { useMemo, useState } from 'react';
import { upcomingDeadlines, type Venue, type VenueInput } from '../../shared/venues';
import { browserStorage, readStored, writeStored } from '../lib/storage';
import { useAppData } from '../state/AppDataContext';
import { localIso } from './calendar';
import { CalendarDialog } from './CalendarDialog';
import { CalendarView } from './CalendarView';
import { DeadlineTimeline } from './DeadlineTimeline';
import { EditionDialog, type EditionTarget } from './EditionDialog';
import { entriesOf } from './format';
import { ImportDialog } from './ImportDialog';
import { VenueDialog } from './VenueDialog';
import { VenuePanel } from './VenuePanel';
import { VenueRow } from './VenueRow';
import { useVenues, VenuesProvider } from './VenuesContext';

type Dialog =
  | { kind: 'none' }
  | { kind: 'venue'; venue: Venue | null; initial?: Partial<VenueInput> }
  | { kind: 'edition'; target: EditionTarget }
  | { kind: 'import' }
  | { kind: 'calendar' };

type View = 'list' | 'calendar';
const VIEW_KEY = 'daicho.venues.view';

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
  const [view, setViewState] = useState<View>(() => (readStored<string>(browserStorage('local'), VIEW_KEY, 'list') === 'calendar' ? 'calendar' : 'list'));
  // 残り日数は、読み込んだ時点を基準にする (開いている間に順序が入れ替わらないように)
  const now = useMemo(() => new Date(), [data]);
  const upcoming = useMemo(() => upcomingDeadlines(data.venues, now), [data.venues, now]);
  const active = data.venues.filter((v) => !v.archived);
  const archived = data.venues.filter((v) => v.archived);
  const selected = data.venues.find((v) => v.id === selectedId) ?? null;
  const close = () => setDialog({ kind: 'none' });

  const today = localIso(now);
  const row = (v: Venue) => (
    <li key={v.id}>
      <VenueRow venue={v} next={upcoming.find((u) => u.venue.id === v.id)} papers={entriesOf(v, library.entries).length}
        now={now} today={today} selected={v.id === selectedId} onSelect={() => setSelectedId(v.id === selectedId ? null : v.id)} />
    </li>
  );
  const setView = (v: View) => {
    setViewState(v);
    writeStored(browserStorage('local'), VIEW_KEY, v);
  };

  return (
    <div className="venues">
      <div className="vn-main">
        <div className="lib-tools">
          <div className="seg" role="group" aria-label="表示の切り替え">
            <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}>一覧</button>
            <button type="button" className={view === 'calendar' ? 'on' : ''} aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>カレンダー</button>
          </div>
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
        ) : view === 'calendar' ? (
          <CalendarView venues={data.venues} now={now} onOpen={(id) => setSelectedId(id)} />
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

      <VenueDialog open={dialog.kind === 'venue'} venue={dialog.kind === 'venue' ? dialog.venue : null}
        initial={dialog.kind === 'venue' ? dialog.initial : undefined} onClose={close}
        onSaved={(id) => { close(); setSelectedId(id); }} />
      <EditionDialog open={dialog.kind === 'edition'} target={dialog.kind === 'edition' ? dialog.target : null} onClose={close} />
      <ImportDialog open={dialog.kind === 'import'} onClose={close} onImported={(id) => setSelectedId(id)}
        onManual={(initial) => setDialog({ kind: 'venue', venue: null, initial })} />
      <CalendarDialog open={dialog.kind === 'calendar'} onClose={close} />
    </div>
  );
}
