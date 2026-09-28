import { useState } from 'react';
import type { WikicfpHit } from '../../shared/venues';
import { useToast } from '../state/useToast';
import { venuesApi } from './api';
import { useVenues } from './VenuesContext';

interface Props { query: string; onImported: (venueId: number) => void }

export const WIKICFP_HOME = 'http://www.wikicfp.com/';

/** 公開データに無い会議を、WikiCFP で探して取り込む。取得は、利用者がボタンを押したときだけ行う */
export function WikicfpSearch({ query, onImported }: Props) {
  const { data, apply } = useVenues();
  // 追跡中の会議の略称 (同じ会議を 2 重に登録しないように、結果に印を付ける)
  const tracked = new Set(data.venues.filter((v) => v.kind === 'conference' && v.acronym).map((v) => v.acronym.toLowerCase()));
  const isTracked = (title: string): boolean => title.toLowerCase().replace(/\b(19|20)\d{2}\b/g, ' ').split(/[^a-z0-9&*+]+/).some((w) => tracked.has(w));
  const toast = useToast();
  const [asked, setAsked] = useState('');
  const [hits, setHits] = useState<WikicfpHit[] | null>(null);
  const [busy, setBusy] = useState<'' | 'search' | number>('');
  const [all, setAll] = useState(false);
  // 去年より前の開催は、求められたときだけ見せる (ワークショップなどを含めて、件数が多くなるため)
  const recent = (hits ?? []).filter((h) => Number(h.title.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0) >= new Date().getFullYear() - 1);
  const shown = all || !recent.length ? hits ?? [] : recent;
  const q = query.trim();

  const search = async () => {
    if (busy !== '' || q.length < 2) return;
    setBusy('search');
    try {
      setHits((await venuesApi.searchWikicfp(q)).hits);
      setAsked(q);
      setAll(false);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy('');
    }
  };
  const add = async (hit: WikicfpHit) => {
    if (busy !== '') return;
    setBusy(hit.eventId);
    try {
      const r = await venuesApi.importVenue(await venuesApi.wikicfpEvent(hit.eventId));
      apply(r);
      onImported(r.summary.venueId);
      const s = r.summary;
      toast(s.created ? `${hit.title} を追加しました` : `${hit.title} を取り込みました (追加 ${s.added}、更新 ${s.updated}${s.kept ? `、手で直した ${s.kept} 件はそのまま` : ''})`);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="vn-unlisted" aria-labelledby="vn-wk-h">
      <h3 id="vn-wk-h">WikiCFP で探す</h3>
      <p className="vn-dialog-note">
        上の公開データに無い会議は、<a href={WIKICFP_HOME} target="_blank" rel="noopener">WikiCFP ↗</a> (CC BY-SA 3.0) から取り込めます。
        利用者が投稿した情報なので、取り込んだあとに会議のサイトで確かめてください。締切は日付だけで、時刻は AoE として扱います。
      </p>
      <button type="button" className="sbtn" disabled={busy !== '' || q.length < 2} onClick={() => void search()}>
        {busy === 'search' ? '探しています (数秒かかります)…' : q.length < 2 ? '検索欄に会議の名前を入れてください' : `「${q}」を WikiCFP で探す`}
      </button>
      {hits && (
        <ul aria-label={`WikiCFP での「${asked}」の結果`}>
          {shown.map((h) => (
            <li key={h.eventId} className="vn-wk-item">
              <span className="vn-wk-main">
                <span className="vn-acr">{h.title}{isTracked(h.title) && <span className="vn-due-label">同じ略称の会議を追跡中</span>}</span>
                <span className="vn-name">{h.name}</span>
                <span className="vn-wk-facts">
                  {h.when && <span>開催 {h.when}</span>}
                  {h.where && <span>{h.where}</span>}
                  {h.deadline && <span>締切 {h.deadline}</span>}
                </span>
              </span>
              <button type="button" className="sbtn" disabled={busy !== ''} aria-label={`${h.title} を取り込む`} onClick={() => void add(h)}>
                {busy === h.eventId ? '取り込み中…' : '取り込む'}
              </button>
            </li>
          ))}
          {!hits.length && <li className="vn-none">「{asked}」は見つかりません。手入力で追加できます。</li>}
          {shown.length < hits.length && (
            <li className="vn-none"><button type="button" className="linkbtn" onClick={() => setAll(true)}>古い開催も表示 (ほか {hits.length - shown.length} 件)</button></li>
          )}
        </ul>
      )}
    </section>
  );
}
