import { useState } from 'react';
import { daysUntil, DEADLINE_LABELS, dueInstant, VENUE_KIND_LABELS, venueTitle, type Venue, type VenueEdition } from '../../shared/venues';
import { navigate } from '../lib/router';
import { useAppData } from '../state/AppDataContext';
import { useDialogs } from '../state/DialogContext';
import { useLibrary } from '../state/LibraryContext';
import { useToast } from '../state/useToast';
import { venuesApi } from './api';
import type { EditionTarget } from './EditionDialog';
import { editionDates, entriesOf, localWhen, originalWhen, remaining, urgency } from './format';
import { useVenues } from './VenuesContext';

interface Props {
  venue: Venue;
  now: Date;
  onClose: () => void;
  onEditVenue: () => void;
  onEdition: (t: EditionTarget) => void;
}

const isWeb = (u: string): boolean => /^https?:\/\//i.test(u);

/** 選んだ会議・論文誌の詳細。年ごとの開催を新しい順に並べる */
export function VenuePanel({ venue, now, onClose, onEditVenue, onEdition }: Props) {
  const { run, apply } = useVenues();
  const { data: library } = useAppData();
  const { selectSource, setQuery } = useLibrary();
  const { open } = useDialogs();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const papers = entriesOf(venue, library.entries);
  const latest = venue.editions.filter((e) => !e.label).sort((a, b) => b.year - a.year)[0];

  const next = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await venuesApi.nextEdition(venue.id);
      apply(r);
      toast(r.site.siteUrl
        ? `${latest!.year + 1} 年の開催を予想で作りました。サイトが見つかりました。`
        : `${latest!.year + 1} 年の開催を予想で作りました。サイトはまだ見つかりません。`);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const remove = () => open({
    kind: 'confirm', title: '会議・論文誌を削除',
    body: `「${venueTitle(venue)}」と、その開催・締切をすべて削除します。台帳の論文は削除されません。`, confirmLabel: '削除する',
    onConfirm: async () => { if (await run(() => venuesApi.remove(venue.id), '削除しました')) onClose(); },
  });
  const removeEdition = (e: VenueEdition) => open({
    kind: 'confirm', title: '開催を削除', body: `${e.year} 年の開催と、その締切を削除します。`, confirmLabel: '削除する',
    onConfirm: async () => { await run(() => venuesApi.removeEdition(e.id), '削除しました'); },
  });
  const showPapers = () => {
    selectSource({ kind: 'builtin', id: 'all' });
    setQuery((q) => ({ ...q, search: venue.acronym || venue.name }));
    navigate({ name: 'library' });
  };

  return (
    <aside className="detail-panel vn-panel" aria-label="会議・論文誌の詳細">
      <div className="dp-head">
        <h2 className="dp-title">{venueTitle(venue)}</h2>
        <button type="button" className="dp-close" aria-label="詳細を閉じる" onClick={onClose}>×</button>
      </div>
      {venue.acronym && venue.name !== venue.acronym && <div className="vn-fullname">{venue.name}</div>}
      <div className="dp-venue">
        <span className="pill">{VENUE_KIND_LABELS[venue.kind]}</span>
        {venue.org && <span>{venue.org}</span>}
        {venue.field && <span>{venue.field}</span>}
        {venue.core && <span className="pill rank-a">CORE {venue.core}</span>}
        {venue.impactFactor && <span className="pill if">IF {venue.impactFactor}</span>}
        {venue.archived && <span className="pill na">アーカイブ済み</span>}
      </div>
      {isWeb(venue.siteUrl) && <a className="vn-link" href={venue.siteUrl} target="_blank" rel="noopener">入口のサイトを開く ↗</a>}
      {venue.note && <p className="vn-note">{venue.note}</p>}
      {papers.length > 0 && (
        <button type="button" className="linkbtn" onClick={showPapers}>台帳にある論文 {papers.length} 件を表示</button>
      )}

      <section className="dp-sec">
        <h3>年ごとの開催</h3>
        {!venue.editions.length && <div className="df-note">まだ開催が登録されていません。</div>}
        <ul className="vn-editions">
          {venue.editions.map((e) => (
            <li key={e.id} className={e.estimated ? 'guess' : ''}>
              <div className="vn-ed-head">
                <span className="vn-ed-year">{e.year}{e.label ? ` ${e.label}` : ''}</span>
                {e.estimated && <span className="vn-guess" title="前の年から予想した内容です">予想</span>}
                <span className="spacer" />
                <button type="button" className="sbtn" onClick={() => onEdition({ venue, edition: e })}>編集</button>
                <button type="button" className="sbtn danger" aria-label={`${e.year} 年の開催を削除`} onClick={() => removeEdition(e)}>削除</button>
              </div>
              <dl className="vn-ed-facts">
                <dt>開催</dt>
                <dd>{editionDates(e) || '未定'}</dd>
                {e.place && <><dt>場所</dt><dd>{e.place}</dd></>}
              </dl>
              {isWeb(e.siteUrl)
                ? <a className="vn-link" href={e.siteUrl} target="_blank" rel="noopener">{e.year} 年のサイト ↗</a>
                : <span className="vn-ed-nosite">{e.year} 年のサイトは未登録</span>}
              {e.deadlines.length > 0 && (
                <ul className="vn-ed-deadlines" aria-label={`${e.year} 年の締切`}>
                  {e.deadlines.map((d) => {
                    const at = dueInstant(d.dueLocal, d.timezone);
                    const days = at ? daysUntil(at, now) : -1;
                    return (
                      <li key={d.id} className={days < 0 ? 'past' : ''}>
                        <span className="vn-dl-name">
                          {d.kind === 'other' && d.label ? d.label : DEADLINE_LABELS[d.kind]}
                          {d.kind !== 'other' && d.label && <span className="vn-due-label">{d.label}</span>}
                          {d.estimated && <span className="vn-guess">予想</span>}
                        </span>
                        <span className="vn-dl-when">{at ? `${localWhen(at, true)} まで` : originalWhen(d)}</span>
                        <span className="vn-dl-orig">元の表記 {originalWhen(d)}</span>
                        <span className={'vn-dl-left' + (days >= 0 ? ' ' + urgency(days) : '')}>{remaining(days)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {e.note && <p className="vn-note">{e.note}</p>}
            </li>
          ))}
        </ul>
        <div className="vn-ed-actions">
          <button type="button" className="sbtn" onClick={() => onEdition({ venue, edition: null })}>開催を追加</button>
          {latest && (
            <button type="button" className="sbtn" disabled={busy} title="前の年の日付を 1 年ずらし、その年のサイトを探します" onClick={() => void next()}>
              {busy ? 'サイトを探しています…' : `${latest.year + 1} 年を予想で作る`}
            </button>
          )}
        </div>
      </section>

      <div className="dp-actions">
        <button type="button" className="hbtn" onClick={onEditVenue}>編集</button>
        <button type="button" className="hbtn" onClick={() => void run(() => venuesApi.setArchived(venue.id, !venue.archived), venue.archived ? 'アーカイブを解除しました' : 'アーカイブしました')}>
          {venue.archived ? 'アーカイブ解除' : 'アーカイブ'}
        </button>
        <button type="button" className="hbtn danger" onClick={remove}>削除</button>
      </div>
      {venue.source === 'ccfddl' && <div className="df-note vn-src">締切の一部は、公開データ ccfddl/ccf-deadlines (MIT License) から取り込みました。</div>}
    </aside>
  );
}
