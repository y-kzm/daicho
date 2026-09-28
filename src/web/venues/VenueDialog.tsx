import { useState, type FormEvent } from 'react';
import { VENUE_KIND_LABELS, VENUE_KINDS, type Venue, type VenueInput, type VenueKind } from '../../shared/venues';
import { Modal } from '../components/Modal';
import { useToast } from '../state/useToast';
import { venuesApi } from './api';
import { useVenues } from './VenuesContext';

interface Props { open: boolean; venue: Venue | null; onClose: () => void; onSaved: (id: number) => void }

export function VenueDialog(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} id="venueDialog">
      <Body {...props} />
    </Modal>
  );
}

const EMPTY: VenueInput = {
  kind: 'conference', acronym: '', name: '', org: '', field: '', core: '', impactFactor: '', siteUrl: '', note: '', source: 'manual', sourceKey: '',
};

function Body({ venue, onClose, onSaved }: Props) {
  const { apply } = useVenues();
  const toast = useToast();
  const [f, setF] = useState<VenueInput>(() => (venue
    ? {
      kind: venue.kind, acronym: venue.acronym, name: venue.name, org: venue.org, field: venue.field, core: venue.core,
      impactFactor: venue.impactFactor, siteUrl: venue.siteUrl, note: venue.note, source: venue.source, sourceKey: venue.sourceKey,
    }
    : EMPTY));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof VenueInput>(k: K, v: VenueInput[K]) => setF((s) => ({ ...s, [k]: v }));
  const text = (k: 'acronym' | 'name' | 'org' | 'field' | 'core' | 'impactFactor' | 'siteUrl', extra: Record<string, unknown> = {}) => (
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
      <h2>{venue ? '会議・論文誌を編集' : '会議・論文誌を追加'}</h2>
      <div className="grid">
        <label className="field">種類
          <select name="kind" value={f.kind} onChange={(ev) => set('kind', ev.target.value as VenueKind)}>
            {VENUE_KINDS.map((k) => <option key={k} value={k}>{VENUE_KIND_LABELS[k]}</option>)}
          </select>
        </label>
        <label className="field">略称 {text('acronym', { placeholder: '例: IMC', autoFocus: true })}</label>
        <label className="field full">正式名 {text('name', { placeholder: '例: ACM Internet Measurement Conference' })}</label>
        <label className="field">主催 {text('org', { placeholder: '例: ACM、IEEE、USENIX' })}</label>
        <label className="field">分野 {text('field', { placeholder: '例: ネットワーク測定' })}</label>
        <label className="field">CORE Ranking {text('core', { placeholder: '例: A*, A, B, C' })}</label>
        <label className="field">Impact Factor {text('impactFactor', { placeholder: '論文誌の場合' })}</label>
        <label className="field full">入口のサイト (年によらない URL)
          {text('siteUrl', { type: 'url', placeholder: 'https://' })}
        </label>
        <label className="field full">メモ
          <textarea name="note" value={f.note} placeholder="投稿の方針、採択率、注意点など" onChange={(ev) => set('note', ev.target.value)} />
        </label>
      </div>
      <p className="vn-dialog-note">年ごとのサイト、開催日、締切は、追加したあとに「年ごとの開催」で登録します。</p>
      <div className="dialog-actions">
        <button type="button" className="cancel" onClick={onClose}>キャンセル</button>
        <button type="submit" className="submit" disabled={busy}>保存する</button>
      </div>
    </form>
  );
}
