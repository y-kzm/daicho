import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../state/useToast';
import { venuesApi } from './api';
import { CCFDDL_HOME, loadCatalog, searchCatalog, type CatalogItem } from './ccfddl';
import { useVenues } from './VenuesContext';

interface Props { open: boolean; onClose: () => void; onImported: (venueId: number) => void }

export function ImportDialog(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} id="importVenueDialog">
      <Body {...props} />
    </Modal>
  );
}

function Body({ onClose, onImported }: Props) {
  const { data, apply } = useVenues();
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
  const hits = useMemo(() => (catalog ? searchCatalog(catalog, q, 30) : []), [catalog, q]);

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
          <ul className="vn-catalog">
            {hits.map((it) => (
              <li key={it.key}>
                <span className="vn-cat-main">
                  <span className="vn-acr">{it.acronym}</span>
                  <span className="vn-name">{it.name}</span>
                </span>
                <span className="vn-cat-meta">
                  {it.core && <span className="pill rank-a">CORE {it.core}</span>}
                  <span>{it.latestYear ? `${it.latestYear} 年まで` : '開催の情報なし'}</span>
                </span>
                <button type="button" className="sbtn" disabled={busy !== ''} onClick={() => void add(it)}>
                  {busy === it.key ? '取り込み中…' : tracked.has(it.key) ? '最新にする' : '追加'}
                </button>
              </li>
            ))}
            {!hits.length && <li className="vn-none">見つかりません。手入力で追加できます。</li>}
          </ul>
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
