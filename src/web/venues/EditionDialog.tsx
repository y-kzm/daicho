import { useState, type FormEvent } from 'react';
import type { LlmProvider } from '../../shared/types';
import {
  DEADLINE_KINDS, DEADLINE_LABELS, DEADLINES_MAX, editionTitle, parseDateRange,
  type DeadlineInput, type DeadlineKind, type EditionInput, type ExtractedEdition, type Venue, type VenueEdition,
} from '../../shared/venues';
import { Modal } from '../components/Modal';
import { useToast } from '../state/useToast';
import { venuesApi } from './api';
import { useVenues } from './VenuesContext';

/** edition が null なら新規 */
export interface EditionTarget { venue: Venue; edition: VenueEdition | null }
interface Props { open: boolean; target: EditionTarget | null; onClose: () => void }

export function EditionDialog({ open, target, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} id="editionDialog">
      {target && <Body key={target.edition?.id ?? 'new'} target={target} onClose={onClose} />}
    </Modal>
  );
}

const TIMEZONES = ['AoE', 'UTC', 'JST', 'UTC-8', 'UTC-7', 'UTC-5', 'UTC-4', 'UTC+1', 'UTC+2', 'UTC+8', 'UTC+9'];
const newDeadline = (): DeadlineInput => ({ kind: 'paper', label: '', dueLocal: '', timezone: 'AoE', estimated: false, source: 'manual' });

function initial(t: EditionTarget): EditionInput {
  const e = t.edition;
  if (e) {
    return {
      year: e.year, label: e.label, siteUrl: e.siteUrl, place: e.place, dateText: e.dateText, startDate: e.startDate, endDate: e.endDate,
      estimated: e.estimated, source: e.source, note: e.note,
      deadlines: e.deadlines.map((d) => ({ kind: d.kind, label: d.label, dueLocal: d.dueLocal, timezone: d.timezone, estimated: d.estimated, source: d.source })),
    };
  }
  const latest = t.venue.editions.reduce((m, x) => Math.max(m, x.year), 0);
  const thisYear = new Date().getFullYear();
  return {
    // 会議は次の年の開催を、論文誌は今年の特集号を足すことが多い
    year: t.venue.kind === 'journal' ? thisYear : latest ? latest + 1 : thisYear + 1, label: '', siteUrl: '', place: '', dateText: '', startDate: '', endDate: '',
    estimated: false, source: 'manual', note: '', deadlines: [newDeadline()],
  };
}

function Body({ target, onClose }: { target: EditionTarget; onClose: () => void }) {
  const { apply } = useVenues();
  const toast = useToast();
  const [f, setF] = useState<EditionInput>(() => initial(target));
  const [first] = useState(() => JSON.stringify(initial(target)));
  const [busy, setBusy] = useState<'' | 'save' | 'site' | 'ai'>('');
  const [provider, setProvider] = useState<LlmProvider>('claude');
  const [found, setFound] = useState<ExtractedEdition | null>(null);
  const saved = target.edition;
  const journal = target.venue.kind === 'journal';
  const unit = journal ? '特集号' : '開催';
  const set = <K extends keyof EditionInput>(k: K, v: EditionInput[K]) => setF((s) => ({ ...s, [k]: v }));
  const setDeadline = (i: number, patch: Partial<DeadlineInput>) =>
    setF((s) => ({ ...s, deadlines: s.deadlines.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));

  const onDateText = (text: string) => {
    // 「Oct 12-16, 2026」のような表記が読めたら、開催日と終了日も埋める
    const r = parseDateRange(text, f.year);
    setF((s) => ({ ...s, dateText: text, ...(r ? { startDate: r.start, endDate: r.end } : {}) }));
  };

  const findSite = async () => {
    if (!saved || busy) return;
    setBusy('site');
    try {
      const r = await venuesApi.findSite(saved.id);
      if (r.siteUrl) { set('siteUrl', r.siteUrl); toast('サイトが見つかりました。内容を確認してから保存してください。'); }
      else toast(r.tried.length ? `見つかりませんでした (${r.tried.length} 件の候補を確認)。まだ公開されていない可能性があります。` : '前の年のサイトが登録されていないため、候補を作れません。', true);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy('');
    }
  };

  const extract = async () => {
    if (!saved || busy) return;
    if (!f.siteUrl.trim()) { toast('先にサイトの URL を入力してください', true); return; }
    setBusy('ai');
    try {
      const r = await venuesApi.extract(saved.id, f.siteUrl.trim(), provider);
      setFound(r);
      if (!r.deadlines.length && !r.dateText) toast('サイトから日程を読み取れませんでした。', true);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy('');
    }
  };

  /** 候補を入力欄へ移す。保存するまでは確定しない */
  const useFound = () => {
    if (!found) return;
    setF((s) => ({
      ...s,
      place: found.place || s.place, dateText: found.dateText || s.dateText,
      startDate: found.startDate || s.startDate, endDate: found.endDate || s.endDate,
      deadlines: found.deadlines.length ? found.deadlines.slice(0, DEADLINES_MAX) : s.deadlines,
      estimated: false,
    }));
    setFound(null);
    toast('候補を入力欄に入れました。サイトと見比べてから保存してください。');
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    // 以前に名前なしで登録したものは、そのまま保存できるようにする
    if (journal && !saved && !f.label.trim()) { toast('特集号の名前を入力してください', true); return; }
    const deadlines = f.deadlines.filter((d) => d.dueLocal.trim());
    // 何も変えずに保存した場合は、取得元を保つ (公開データでの更新を止めない)。
    // 変更して保存した内容は手で直したものとして扱い、公開データの再取り込みで上書きしない
    const unchanged = saved !== null && JSON.stringify(f) === first;
    const input: EditionInput = {
      ...f, source: unchanged ? f.source : 'manual',
      // 論文誌には開催日が無いので、「開催日は予想」は付けない
      estimated: journal ? false : f.estimated,
      deadlines: deadlines.map((d) => ({
        ...d, dueLocal: d.dueLocal.trim().replace('T', ' '), source: unchanged || d.source === 'ai' ? d.source : 'manual',
      })),
    };
    setBusy('save');
    try {
      apply(saved ? await venuesApi.updateEdition(saved.id, input) : await venuesApi.addEdition(target.venue.id, input));
      toast(saved ? '更新しました' : '追加しました');
      onClose();
    } catch (err) {
      toast((err as Error).message, true);
      setBusy('');
    }
  };

  return (
    <form className="inner" onSubmit={(ev) => void submit(ev)}>
      <h2>{saved ? `${editionTitle(target.venue, saved)} を編集` : `${target.venue.acronym || target.venue.name} の${unit}を追加`}</h2>
      <div className="grid">
        <label className="field">年
          <input name="year" type="number" min={1950} max={2100} required value={f.year} onChange={(ev) => set('year', Number(ev.target.value))} />
        </label>
        <label className="field">{journal ? '特集号の名前' : '名前 (併設の回など。通常は空)'}
          <input name="label" value={f.label} required={journal && !saved} placeholder={journal ? '例: Special Issue on Network Measurement' : ''}
            onChange={(ev) => set('label', ev.target.value)} />
        </label>

        <div className="inline-btn-row full">
          <label className="field">{journal ? '募集のページ' : `${f.year} 年のサイト`}
            <input name="siteUrl" type="url" placeholder="https://" value={f.siteUrl} onChange={(ev) => set('siteUrl', ev.target.value)} />
          </label>
          {!journal && <button type="button" disabled={!saved || busy !== ''} onClick={() => void findSite()}
            title={saved ? '前の年のサイトの URL から、年を置き換えた候補を確かめます' : '一度保存すると使えます'}>
            {busy === 'site' ? '探しています…' : 'サイトを探す'}
          </button>}
        </div>

        {!journal && <>
        <label className="field full">開催日の表記
          <input name="dateText" placeholder="例: Oct 12-16, 2026 (読み取れた場合は、下の日付を自動で埋めます)" value={f.dateText}
            onChange={(ev) => onDateText(ev.target.value)} />
        </label>
        <label className="field">開催日
          <input name="startDate" type="date" value={f.startDate} onChange={(ev) => set('startDate', ev.target.value)} />
        </label>
        <label className="field">終了日
          <input name="endDate" type="date" value={f.endDate} onChange={(ev) => set('endDate', ev.target.value)} />
        </label>
        {f.startDate && Number(f.startDate.slice(0, 4)) !== f.year && (
          <div className="vn-dialog-note full" role="note">開催日が {f.startDate.slice(0, 4)} 年になっています。上の「年」は {f.year} です。違う場合は、どちらかを直してください。</div>
        )}
        <label className="field full">開催地
          <input name="place" placeholder="例: Madrid, Spain" value={f.place} onChange={(ev) => set('place', ev.target.value)} />
        </label>
        </>}
      </div>

      <div className="vn-dl-editor">
        <div className="vn-dl-editor-head">
          <h3>締切</h3>
          <span className="sumtools">
            <select aria-label="AI の種類" value={provider} onChange={(ev) => setProvider(ev.target.value as LlmProvider)}>
              <option value="claude">Claude Haiku</option>
              <option value="gemini">Gemini</option>
            </select>
            <button type="button" className="genbtn" disabled={!saved || busy !== ''} onClick={() => void extract()}
              title={saved ? 'サイトを読み、締切の候補を出します。保存はしません' : '一度保存すると使えます'}>
              {busy === 'ai' ? '読み取り中…' : 'サイトから候補を読み取る'}
            </button>
          </span>
        </div>

        {found && (
          <div className="vn-found" role="status">
            <div className="vn-found-head">
              {found.provider} が読み取った候補です。間違っていることがあるので、<a href={found.pageUrl} target="_blank" rel="noopener">サイト ↗</a> と見比べてください。
            </div>
            <ul>
              {found.dateText && <li>開催日: {found.dateText}{found.startDate ? ` (${found.startDate} 〜 ${found.endDate})` : ' (日付として読めませんでした)'}</li>}
              {found.place && <li>開催地: {found.place}</li>}
              {found.deadlines.map((d, i) => (
                <li key={i}>{DEADLINE_LABELS[d.kind]}{d.label ? ` (${d.label})` : ''}: {d.dueLocal} {d.timezone}</li>
              ))}
              {!found.deadlines.length && <li>締切は読み取れませんでした</li>}
            </ul>
            <div className="menu-actions">
              <button type="button" className="sbtn" onClick={() => setFound(null)}>使わない</button>
              <button type="button" className="sbtn" disabled={!found.deadlines.length && !found.dateText} onClick={useFound}>入力欄に入れる</button>
            </div>
          </div>
        )}

        {f.deadlines.map((d, i) => (
          <div className="vn-dl-row" key={i}>
            <select aria-label="締切の種類" value={d.kind} onChange={(ev) => setDeadline(i, { kind: ev.target.value as DeadlineKind })}>
              {DEADLINE_KINDS.map((k) => <option key={k} value={k}>{DEADLINE_LABELS[k]}</option>)}
            </select>
            <input aria-label="締切の日時" placeholder="2026-05-15 23:59" value={d.dueLocal}
              onChange={(ev) => setDeadline(i, { dueLocal: ev.target.value })} />
            <input aria-label="タイムゾーン" list="venueTimezones" className="vn-tz" value={d.timezone}
              onChange={(ev) => setDeadline(i, { timezone: ev.target.value })} />
            <input aria-label="名前" placeholder="名前 (例: Cycle 1)" value={d.label} onChange={(ev) => setDeadline(i, { label: ev.target.value })} />
            <label className="vn-dl-guess" title="前の年から予想した、未確認の日付">
              <input type="checkbox" checked={d.estimated} onChange={(ev) => setDeadline(i, { estimated: ev.target.checked })} />予想
            </label>
            <button type="button" className="sbtn danger" aria-label="この締切を削除"
              onClick={() => setF((s) => ({ ...s, deadlines: s.deadlines.filter((_, j) => j !== i) }))}>削除</button>
          </div>
        ))}
        <datalist id="venueTimezones">{TIMEZONES.map((t) => <option key={t} value={t} />)}</datalist>
        <div className="vn-dl-foot">
          <button type="button" className="sbtn" disabled={f.deadlines.length >= DEADLINES_MAX}
            onClick={() => setF((s) => ({ ...s, deadlines: [...s.deadlines, newDeadline()] }))}>締切を追加</button>
          <span className="vn-dialog-note">日時は、{journal ? '募集のページ' : '会議のサイト'}に書かれている表記のまま入力します。AoE は、地球上のどこかでその日が続いている間、という意味です。</span>
        </div>
      </div>

      <div className="grid">
        {!journal && <label className="field full vn-check">
          <span><input type="checkbox" checked={f.estimated} onChange={(ev) => set('estimated', ev.target.checked)} /> 開催日は予想 (未確認)</span>
        </label>}
        <label className="field full">メモ
          <textarea name="note" value={f.note} onChange={(ev) => set('note', ev.target.value)} />
        </label>
      </div>
      {saved && saved.source !== 'manual' && (
        <p className="vn-dialog-note" role="note">
          {saved.source === 'estimate' ? `この${unit}は、前の年から予想で作ったものです。` : `この${unit}は、公開データから取り込んだものです。`}
          内容を変えて保存すると、以後は公開データでは更新されなくなります。
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="cancel" onClick={onClose}>キャンセル</button>
        <button type="submit" className="submit" disabled={busy !== ''}>保存する</button>
      </div>
    </form>
  );
}
