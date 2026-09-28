import { useState, type FormEvent } from 'react';
import { VENUE_KIND_LABELS, type Venue, type VenueInput } from '../../shared/venues';
import { Modal } from '../components/Modal';
import { useToast } from '../state/useToast';
import { venuesApi } from './api';
import { useVenues } from './VenuesContext';

interface Props {
  open: boolean;
  venue: Venue | null;
  /** 新しく追加するときに、あらかじめ入れておく内容 */
  initial?: Partial<VenueInput>;
  onClose: () => void;
  onSaved: (id: number) => void;
}

export function VenueDialog(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} id="venueDialog">
      <Body {...props} />
    </Modal>
  );
}

const EMPTY: VenueInput = {
  kind: 'conference', acronym: '', name: '', org: '', field: '', core: '', impactFactor: '', siteUrl: '', issn: '', reviewTime: '', submitUrl: '', note: '', source: 'manual', sourceKey: '',
};

function Body({ venue, initial, onClose, onSaved }: Props) {
  const { apply } = useVenues();
  const toast = useToast();
  const [f, setF] = useState<VenueInput>(() => (venue
    ? {
      kind: venue.kind, acronym: venue.acronym, name: venue.name, org: venue.org, field: venue.field, core: venue.core,
      impactFactor: venue.impactFactor, siteUrl: venue.siteUrl, issn: venue.issn, reviewTime: venue.reviewTime, submitUrl: venue.submitUrl, note: venue.note, source: venue.source, sourceKey: venue.sourceKey,
    }
    : { ...EMPTY, ...initial }));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof VenueInput>(k: K, v: VenueInput[K]) => setF((s) => ({ ...s, [k]: v }));
  const journal = f.kind === 'journal';
  const text = (k: 'acronym' | 'name' | 'org' | 'field' | 'core' | 'impactFactor' | 'siteUrl' | 'issn' | 'reviewTime' | 'submitUrl', extra: Record<string, unknown> = {}) => (
    <input name={k} value={f[k]} onChange={(ev) => set(k, ev.target.value)} {...extra} />
  );

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    if (!f.name.trim() && !f.acronym.trim()) { toast('名前か略称を入力してください', true); return; }
    setBusy(true);
    try {
      if (venue) {
        apply(await venuesApi.update(venue.id, f));
        onSaved(venue.id);
        toast('更新しました');
      } else {
        const r = await venuesApi.add(f);
        apply(r);
        onSaved(r.id);
        toast('追加しました');
      }
    } catch (err) {
      toast((err as Error).message, true);
      setBusy(false);
    }
  };

  return (
    <form className="inner" onSubmit={(ev) => void submit(ev)}>
      <h2>{VENUE_KIND_LABELS[f.kind]}を{venue ? '編集' : '追加'}</h2>
      <div className="grid">
        <label className="field full">正式名 {text('name', { placeholder: journal ? '例: IEEE/ACM Transactions on Networking' : '例: ACM Internet Measurement Conference', autoFocus: true })}</label>
        <label className="field">略称 {text('acronym', { placeholder: journal ? '例: ToN' : '例: IMC' })}</label>
        <label className="field">{journal ? '出版社' : '主催'} {text('org', { placeholder: '例: ACM、IEEE、USENIX' })}</label>
        <label className="field">分野 {text('field', { placeholder: '例: ネットワーク測定' })}</label>
        {journal ? (
          <>
            <label className="field">Impact Factor {text('impactFactor', { placeholder: '例: 3.7' })}</label>
            <label className="field">ISSN {text('issn', { placeholder: '例: 1063-6692', pattern: '\\d{4}-\\d{3}[\\dXx]' })}</label>
            <label className="field">査読期間の目安 {text('reviewTime', { placeholder: '例: 最初の判定まで 3 か月' })}</label>
            <label className="field full">論文誌のサイト {text('siteUrl', { type: 'url', placeholder: 'https://' })}</label>
            <label className="field full">投稿先の URL {text('submitUrl', { type: 'url', placeholder: 'https:// (投稿システムのページ)' })}</label>
          </>
        ) : (
          <>
            <label className="field">CORE Ranking {text('core', { placeholder: '例: A*, A, B, C' })}</label>
            <label className="field full">入口のサイト (年によらない URL)
              {text('siteUrl', { type: 'url', placeholder: 'https://' })}
            </label>
          </>
        )}
        <label className="field full">メモ
          <textarea name="note" value={f.note} placeholder={journal ? '投稿の方針、掲載料、注意点など' : '投稿の方針、採択率、注意点など'} onChange={(ev) => set('note', ev.target.value)} />
        </label>
      </div>
      <p className="vn-dialog-note">
        {journal ? '特集号の締切は、追加したあとに「特集号」で登録します。' : '年ごとのサイト、開催日、締切は、追加したあとに「年ごとの開催」で登録します。'}
      </p>
      <div className="dialog-actions">
        <button type="button" className="cancel" onClick={onClose}>キャンセル</button>
        <button type="submit" className="submit" disabled={busy}>保存する</button>
      </div>
    </form>
  );
}
