import { useMemo, useState, type FormEvent } from 'react';
import type { VenueInput } from '../../shared/venues';
import { Modal } from '../components/Modal';
import { useAppData } from '../state/AppDataContext';
import { useToast } from '../state/useToast';
import { venuesApi } from './api';
import { OPENALEX_HOME, searchJournals, type JournalHit } from './openalex';
import { unlistedVenues } from './suggest';
import { useVenues } from './VenuesContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: (venueId: number) => void;
  onManual: (initial: Partial<VenueInput>) => void;
}

export function JournalAddDialog(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} id="importVenueDialog">
      <Body {...props} />
    </Modal>
  );
}

function Body({ onClose, onImported, onManual }: Props) {
  const { data, apply } = useVenues();
  const { data: library } = useAppData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<JournalHit[] | null>(null);
  const [busy, setBusy] = useState('');
  const tracked = useMemo(() => new Set(data.venues.filter((v) => v.source === 'openalex').map((v) => v.sourceKey)), [data.venues]);
  // 台帳の論文にある論文誌のうち、まだ追跡していないもの
  const inLibrary = useMemo(() => unlistedVenues(library.entries, data.venues, 8, 'journal'), [library.entries, data.venues]);

  const search = async (text: string) => {
    if (busy || text.trim().length < 2) return;
    setQ(text);
    setBusy('search');
    try {
      setHits(await searchJournals(text));
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy('');
    }
  };
  const add = async (it: JournalHit) => {
    if (busy) return;
    setBusy(it.key);
    try {
      const r = await venuesApi.importVenue(it.data);
      apply(r);
      onImported(r.summary.venueId);
      toast(r.summary.created ? `${it.name} を追加しました` : `${it.name} は追加済みです`);
      onClose();
    } catch (err) {
      toast((err as Error).message, true);
      setBusy('');
    }
  };
  const submit = (ev: FormEvent) => { ev.preventDefault(); void search(q); };

  return (
    <div className="inner">
      <h2>論文誌を検索して追加</h2>
      <p className="vn-dialog-note">
        公開データ <a href={OPENALEX_HOME} target="_blank" rel="noopener">OpenAlex ↗</a> (CC0) から、名前、ISSN、出版社を取り込みます。
        Impact Factor と査読期間は含まれていないので、追加したあとに入力します。
      </p>
      <form className="vn-cal-url" role="search" onSubmit={submit}>
        <input autoFocus aria-label="論文誌を検索" placeholder="名前で検索 (例: Transactions on Networking)" value={q} onChange={(ev) => setQ(ev.target.value)} />
        <button type="submit" className="sbtn" disabled={busy !== '' || q.trim().length < 2}>{busy === 'search' ? '検索中…' : '検索'}</button>
      </form>

      {hits && (
        <div className="vn-catalog">
          <ul>
            {hits.map((it) => (
              <li key={it.key}>
                <span className="vn-cat-main">
                  {it.acronym && <span className="vn-acr">{it.acronym}</span>}
                  <span className={it.acronym ? 'vn-name' : 'vn-acr vn-wrap'}>{it.name}</span>
                </span>
                <span className="vn-cat-meta">
                  {it.publisher && <span>{it.publisher}</span>}
                  {it.issn && <span>ISSN {it.issn}</span>}
                </span>
                <button type="button" className="sbtn" disabled={busy !== '' || tracked.has(it.key)} aria-label={`${it.name} を追加`} onClick={() => void add(it)}>
                  {busy === it.key ? '追加中…' : tracked.has(it.key) ? '追加済み' : '追加'}
                </button>
              </li>
            ))}
          </ul>
          {!hits.length && <div className="vn-none">見つかりません。手入力で追加できます。</div>}
        </div>
      )}

      {inLibrary.length > 0 && (
        <section className="vn-unlisted" aria-labelledby="vn-jl-h">
          <h3 id="vn-jl-h">台帳の論文にある論文誌</h3>
          <p className="vn-dialog-note">まだ追跡していないものです。論文の多い順に並べています。</p>
          <ul>
            {inLibrary.map((u) => (
              <li key={u.name}>
                <span className="vn-name">{u.name}</span>
                <span className="vn-papers">台帳 {u.papers}</span>
                <span className="vn-unlisted-actions">
                  <button type="button" className="sbtn" disabled={busy !== ''} onClick={() => void search(u.name)}>検索</button>
                  <button type="button" className="sbtn" onClick={() => onManual({ name: u.name })}>手入力で追加</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="dialog-actions">
        <button type="button" className="cancel" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
