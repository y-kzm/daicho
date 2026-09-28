import { useEffect, useMemo, useState } from 'react';
import type { VenueInput } from '../../shared/venues';
import { Modal } from '../components/Modal';
import { useAppData } from '../state/AppDataContext';
import { useToast } from '../state/useToast';
import { venuesApi } from './api';
import { CCFDDL_HOME, loadCatalog, searchCatalog, type CatalogItem } from './ccfddl';
import { libraryCounts, unlistedVenues } from './suggest';
import { useVenues } from './VenuesContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: (venueId: number) => void;
  /** 公開データに無いものを、手入力で追加する */
  onManual: (initial: Partial<VenueInput>) => void;
}

export function ImportDialog(props: Props) {
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
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let alive = true;
    loadCatalog(new Date().getFullYear()).then(
      (c) => { if (alive) setCatalog(c); },
      (err: Error) => { if (alive) setError(err.message || '公開データを取得できませんでした。'); },
    );
    return () => { alive = false; };
  }, []);

  const tracked = useMemo(() => new Set(data.venues.filter((v) => v.source === 'ccfddl').map((v) => v.sourceKey)), [data.venues]);
  // 台帳の論文に出てくる会議を、候補の上位に出す
  const counts = useMemo(() => libraryCounts(catalog ?? [], library.entries), [catalog, library.entries]);
  const hits = useMemo(() => (catalog ? searchCatalog(catalog, q, 30, counts) : []), [catalog, q, counts]);
  const unlisted = useMemo(
    () => (catalog ? unlistedVenues(library.entries, [...catalog, ...data.venues]) : []),
    [catalog, library.entries, data.venues],
  );
  const inLibrary = hits.filter((it) => counts.has(it.key));
  // 検索していないときは、台帳の論文にある会議と、そのほかに分けて見せる
  const groups = (!q.trim() && inLibrary.length
    ? [{ title: '台帳の論文にある会議', items: inLibrary }, { title: 'そのほかの会議', items: hits.filter((it) => !counts.has(it.key)) }]
    : [{ title: '', items: hits }]).filter((g) => g.items.length);

  const add = async (it: CatalogItem) => {
    if (busy) return;
    setBusy(it.key);
    try {
      const r = await venuesApi.importVenue(it.data);
      apply(r);
      onImported(r.summary.venueId);
      const s = r.summary;
      toast(s.created
        ? `${it.acronym} を追加しました (開催 ${s.added} 件)`
        : `${it.acronym} を更新しました (追加 ${s.added}、更新 ${s.updated}${s.kept ? `、手で直した ${s.kept} 件はそのまま` : ''})`);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy('');
    }
  };

  /** 追跡中の会議を、まとめて最新にする */
  const refreshAll = async () => {
    if (busy || !catalog) return;
    const targets = catalog.filter((c) => tracked.has(c.key));
    setBusy('*');
    let added = 0;
    let updated = 0;
    let failed = 0;
    for (const it of targets) {
      try {
        const r = await venuesApi.importVenue(it.data);
        apply(r);
        added += r.summary.added;
        updated += r.summary.updated;
      } catch {
        failed++;
      }
    }
    setBusy('');
    toast(`${targets.length} 件を確認しました (開催の追加 ${added}、更新 ${updated}${failed ? `、失敗 ${failed}` : ''})`, failed > 0);
  };

  const item = (it: CatalogItem) => (
    <li key={it.key}>
      <span className="vn-cat-main">
        <span className="vn-acr">{it.acronym}</span>
        <span className="vn-name">{it.name}</span>
      </span>
      <span className="vn-cat-meta">
        {counts.has(it.key) && <span className="vn-papers" title="台帳にある、この会議の論文">台帳 {counts.get(it.key)}</span>}
        {it.core && <span className="pill rank-a">CORE {it.core}</span>}
        <span>{it.latestYear ? `${it.latestYear} 年まで` : '開催の情報なし'}</span>
      </span>
      <button type="button" className="sbtn" disabled={busy !== ''} aria-label={`${it.acronym} を${tracked.has(it.key) ? '最新にする' : '追加'}`}
        onClick={() => void add(it)}>
        {busy === it.key ? '取り込み中…' : tracked.has(it.key) ? '最新にする' : '追加'}
      </button>
    </li>
  );

  return (
    <div className="inner">
      <h2>公開データから追加</h2>
      <p className="vn-dialog-note">
        会議の締切をまとめた公開データ <a href={CCFDDL_HOME} target="_blank" rel="noopener">ccfddl/ccf-deadlines ↗</a> (MIT License) から、
        年ごとのサイトと締切を取り込みます。論文誌は含まれていません。取り込んだあとに手で直した開催は、再取り込みでも上書きしません。
      </p>
      {error && <div className="df-note">{error} 時間をおいてやり直すか、手入力で追加してください。</div>}
      {!catalog && !error && <div className="df-note"><span className="spin" />公開データを読み込んでいます…</div>}
      {catalog && (
        <>
          <input className="aep-q" autoFocus aria-label="会議を検索" placeholder="略称か名前で検索 (例: IMC、USENIX Security)" value={q}
            onChange={(ev) => setQ(ev.target.value)} />
          <div className="vn-catalog">
            {groups.map((g, i) => (
              <section key={g.title || 'hits'} aria-label={g.title ? undefined : '検索の結果'} aria-labelledby={g.title ? `vn-cat-h${i}` : undefined}>
                {g.title && <h3 className="vn-cat-h" id={`vn-cat-h${i}`}>{g.title}</h3>}
                <ul>{g.items.map(item)}</ul>
              </section>
            ))}
            {!hits.length && <div className="vn-none">見つかりません。手入力で追加できます。</div>}
          </div>
          {!q.trim() && unlisted.length > 0 && (
            <section className="vn-unlisted" aria-label="公開データに無い会議・論文誌">
              <h3>公開データに無いもの</h3>
              <p className="vn-dialog-note">台帳の論文にある会議・論文誌のうち、公開データに無いものです。手入力で追加できます。</p>
              <ul>
                {unlisted.map((u) => (
                  <li key={u.name}>
                    <span className="vn-name">{u.name}</span>
                    <span className="vn-papers">台帳 {u.papers}</span>
                    <button type="button" className="sbtn" onClick={() => onManual({ name: u.name, kind: u.kind })}>手入力で追加</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="vn-dl-foot">
            <span className="vn-dialog-note">{catalog.length} 件の会議から検索しています。</span>
            {tracked.size > 0 && (
              <button type="button" className="sbtn" disabled={busy !== ''} onClick={() => void refreshAll()}>
                {busy === '*' ? '確認しています…' : `追跡中の ${tracked.size} 件を最新にする`}
              </button>
            )}
          </div>
        </>
      )}
      <div className="dialog-actions">
        <button type="button" className="cancel" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
