import { useMemo, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import type { CoreResult, Entry, EntryInput, EntryKind, EntryProjectInput, LlmProvider } from '../../../shared/types';
import { DOC_STATUS_HINTS, ENTRY_KINDS, KIND_LABELS, READ_STATES } from '../../../shared/types';
import { api } from '../../api';
import { hasVenue } from '../../lib/kinds';
import { sortByOrder } from '../../lib/order';
import { autofillVenueRatings, buildVenueMaps, coreQueryHint } from '../../lib/venue';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';
import { Modal } from '../Modal';
import { CoreResults } from './CoreResults';
import { EntryDialogTools } from './EntryDialogTools';
import { ProjectPicker } from './ProjectPicker';
import { TagPicker } from './TagPicker';

export interface EntryForm {
  doi: string; title: string; summary: string; year: string; country: string; publisher: string; journal: string;
  impactFactor: string; conference: string; core: string; url: string; bibkey: string; read: string; note: string;
  docStatus: string;
}
const FIELDS = ['doi', 'title', 'summary', 'year', 'country', 'publisher', 'journal', 'impactFactor', 'conference', 'core', 'url', 'bibkey', 'read', 'note', 'docStatus'] as const;

function toForm(e: Entry | null): EntryForm {
  const f = {} as EntryForm;
  for (const k of FIELDS) f[k] = e ? e[k] || (k === 'read' ? '未読' : '') : k === 'read' ? '未読' : '';
  return f;
}

interface Props {
  open: boolean;
  entry: Entry | null;
  initialTags: string[];
  /** 新規追加のときに選択済みにするプロジェクト (開いているプロジェクト) */
  initialProjects: EntryProjectInput[];
  /** 新規追加のときの種類 (開いている種類の枠に合わせる) */
  initialKind: EntryKind;
  onClose: () => void;
  /** 保存と再読み込みの完了後に呼ぶ。projectIds は新規追加で入れたプロジェクト */
  onSaved: (id: number, isNew: boolean, projectIds: number[]) => void;
  onShowPrompt: (text: string) => void;
}

export function EntryDialog(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} id="editDialog">
      <EntryDialogBody {...props} />
    </Modal>
  );
}

function EntryDialogBody({ entry, initialTags, initialProjects, initialKind, onClose, onSaved, onShowPrompt }: Props) {
  const { data, reload } = useAppData();
  const toast = useToast();
  const [f, setF] = useState<EntryForm>(() => toForm(entry));
  const [tags, setTags] = useState<string[]>(() => (entry ? [...entry.tags] : [...initialTags]));
  const [kind, setKind] = useState<EntryKind>(entry ? entry.kind : initialKind);
  const [projects, setProjects] = useState<EntryProjectInput[]>(() => (entry ? [] : [...initialProjects]));
  // 追加先の候補: アーカイブしていないものと、選択済みのもの (アーカイブ済みのプロジェクトを開いている場合)
  const projectChoices = useMemo(
    () => sortByOrder(data.projects).filter((p) => !p.archived || initialProjects.some((s) => s.projectId === p.id)),
    [data.projects, initialProjects],
  );
  const [provider, setProvider] = useState<LlmProvider>('claude');
  const [core, setCore] = useState<CoreResult | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const maps = useMemo(() => buildVenueMaps(data.entries), [data.entries]);

  const set = (k: keyof EntryForm, v: string) => setF((s) => ({ ...s, [k]: v }));
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try { await fn(); } catch (err) { toast((err as Error).message, true); }
    finally { setBusy((b) => ({ ...b, [key]: false })); }
  };
  const autofill = (form: EntryForm): string[] => {
    const r = autofillVenueRatings(form, maps);
    if (r.filled.length) setF((s) => ({ ...s, impactFactor: r.impactFactor, core: r.core }));
    return r.filled;
  };
  const onVenueBlur = () => {
    const filled = autofill(f);
    if (filled.length) toast('既存エントリから ' + filled.join('・') + ' を補完しました');
  };
  const llmInput = () => ({ title: f.title.trim(), doi: f.doi.trim(), url: f.url.trim(), provider });
  const requireTitle = () => { if (!f.title.trim()) { toast('先にタイトルを入力してください', true); return false; } return true; };

  const fetchDoi = () => {
    const input = f.doi.trim() || f.url.trim();
    if (!input) { toast('DOI または DOI を含む URL を入力してください', true); return; }
    void run('doi', async () => {
      const m = await api.doi(input);
      let filled: string[] = [];
      flushSync(() => {
        setF((cur) => {
          const next: EntryForm = {
            ...cur, doi: m.doi,
            title: cur.title || m.title, year: m.year || cur.year, publisher: m.publisher || cur.publisher,
            country: cur.country || m.country, journal: m.journal || cur.journal, conference: m.conference || cur.conference,
            url: cur.url || m.url, bibkey: cur.bibkey || m.bibkeySuggestion,
          };
          const r = autofillVenueRatings(next, maps);
          filled = r.filled;
          return { ...next, impactFactor: r.impactFactor, core: r.core, docStatus: m.docStatus || cur.docStatus };
        });
      });
      // RFC・I-D と判別できたら種類も合わせる。判別できない場合は、選んである種類のまま
      if (m.kind) setKind(m.kind);
      toast((m.kind ? KIND_LABELS[m.kind] + ' として取得しました' : 'Crossref から取得しました') + (filled.length ? ' / 既存エントリから ' + filled.join('・') + ' を補完' : ''));
    });
  };
  const fetchCore = () => {
    const q = f.conference.trim();
    if (!q) { toast('先にカンファレンス名 (または略称) を入力してください', true); return; }
    void run('core', async () => setCore(await api.core(q)));
  };
  const copyPrompt = () => {
    if (!requireTitle()) return;
    void run('prompt', async () => {
      const r = await api.llmPrompt(llmInput());
      const info = r.usedAbstract ? 'アブストラクト (' + r.abstractSource + ') 込みでコピーしました' : 'アブストラクトが見つからず、タイトルのみでコピーしました';
      try { await navigator.clipboard.writeText(r.prompt); toast(info); }
      catch { onShowPrompt(r.prompt); }
    });
  };
  const generate = () => {
    if (!requireTitle()) return;
    void run('summary', async () => {
      const r = await api.llmSummary(llmInput());
      set('summary', r.summary);
      toast(r.usedAbstract
        ? r.provider + ' がアブストラクト (' + r.abstractSource + ') から要約を生成しました'
        : r.provider + ' がタイトルのみから推定生成しました (アブストラクト未発見・要確認)');
    });
  };
  const suggest = () => {
    if (!requireTitle()) return;
    void run('tags', async () => {
      const r = await api.llmTags({ ...llmInput(), summary: f.summary.trim() });
      if (!r.tags.length) { toast('AI は該当タグなしと判断しました'); return; }
      const added = r.tags.filter((t) => !tags.includes(t));
      setTags((cur) => [...cur, ...added]);
      toast(added.length ? 'AI 提案: ' + added.join('・') + ' を選択しました (クリックで解除可)' : 'AI 提案は既に選択済みのタグと同じでした');
    });
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const input = {} as Record<string, string>;
    for (const k of FIELDS) input[k] = f[k].trim();
    // 論文向けの欄は、ほかの種類では画面に出さない。編集前の値は消さずに残す
    const e: EntryInput = { ...(input as unknown as Omit<EntryInput, 'tags' | 'kind'>), tags: [...tags], kind };
    // 状態は論文では使わない (種類を論文に戻した場合に、古い値を残さない)
    if (hasVenue(kind)) e.docStatus = '';
    if (!e.title) { toast('タイトルを入力してください', true); return; }
    const selfId = entry ? entry.id : -1;
    const dup = data.entries.find((x) => x.id !== selfId && (x.title.trim() === e.title || (e.doi && x.doi.trim() === e.doi)));
    if (dup) {
      const via = dup.title.trim() === e.title ? 'タイトル' : 'DOI';
      if (!window.confirm('同じ' + via + 'のエントリが既に登録されています:\n「' + dup.title + '」\n\n重複を承知で保存しますか？')) return;
    }
    void run('submit', async () => {
      let id: number;
      let sent: number[] = [];
      if (entry) {
        await api.updateEntry(entry.id, e);
        id = entry.id;
      } else {
        // 開いている間に削除されたプロジェクトは送らない
        const alive = projects.filter((s) => data.projects.some((p) => p.id === s.projectId));
        id = (await api.addEntry(e, alive)).id;
        sent = alive.map((s) => s.projectId);
      }
      // DOI のある論文は、追加したときと DOI を変えたときに Open Access を判定する (失敗しても保存は済んでいる)
      if (e.doi && kind === 'paper' && (!entry || entry.doi.trim() !== e.doi.trim())) await api.checkOa(id).catch(() => undefined);
      await reload();
      onSaved(id, !entry, sent);
      toast(entry ? '更新しました' : '追加しました');
    });
  };

  const coreLink = data.links.core + (f.conference.trim() ? '?search=' + encodeURIComponent(coreQueryHint(f.conference.trim())) + '&by=all' : '');
  const text = (k: keyof EntryForm, extra: Record<string, unknown> = {}) => (
    <input name={k} value={f[k]} onChange={(ev) => set(k, ev.target.value)} {...extra} />
  );

  return (
    <form className="inner" onSubmit={submit}>
      <h2>{entry ? `${KIND_LABELS[kind]}を編集` : `${KIND_LABELS[kind]}を追加`}</h2>
      <div className="grid">
        <div className="inline-btn-row full">
          <label className="field">DOI / URL / RFC番号 / internet-draft名 {text('doi', { placeholder: 'https://doi.org/xxxx' })}</label>
          <button type="button" disabled={!!busy.doi} onClick={fetchDoi}>{busy.doi ? '取得中…' : '自動入力'}</button>
        </div>
        <label className="field">種類
          <select name="kind" value={kind} onChange={(ev) => setKind(ev.target.value as EntryKind)}>
            {ENTRY_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
        </label>
        {hasVenue(kind)
          ? <span />
          : (
            <label className="field">状態
              {text('docStatus', { list: 'docStatusHints', placeholder: DOC_STATUS_HINTS[kind][0] ? `例: ${DOC_STATUS_HINTS[kind][0]}` : '' })}
              <datalist id="docStatusHints">{DOC_STATUS_HINTS[kind].map((h) => <option key={h} value={h} />)}</datalist>
            </label>
          )}
        <label className="field full">タイトル (必須) {text('title', { required: true })}</label>
        <div className="field full">
          <span className="flabel">概要
            <EntryDialogTools provider={provider} onProvider={setProvider} busyPrompt={!!busy.prompt} busySummary={!!busy.summary}
              onCopyPrompt={copyPrompt} onGenerate={generate} />
          </span>
          <textarea name="summary" aria-label="概要" value={f.summary} onChange={(ev) => set('summary', ev.target.value)} />
        </div>
        <label className="field">年 {text('year', { inputMode: 'numeric' })}</label>
        <label className="field">出版国 {text('country')}</label>
        <label className="field full">{hasVenue(kind) ? '出版社' : '発行元 (組織名)'} {text('publisher')}</label>

        {hasVenue(kind) && (
        <>
        <div className="venue-group">
          <div className="vg-head">ジャーナル <a href={data.links.jcr} target="_blank" rel="noopener">Impact Factor を JCR で調べる ↗</a></div>
          <div className="vg-fields">
            <label className="field">ジャーナル名 {text('journal', { onBlur: onVenueBlur })}</label>
            <label className="field">Impact Factor {text('impactFactor', { placeholder: '例: 4.2 / N/A' })}</label>
          </div>
        </div>

        <div className="venue-group">
          <div className="vg-head">カンファレンス <a href={coreLink} target="_blank" rel="noopener">CORE portal で調べる ↗</a></div>
          <div className="vg-fields">
            <label className="field">カンファレンス名 {text('conference', { onBlur: onVenueBlur })}</label>
            <div className="with-btn">
              <label className="field">CORE Ranking {text('core', { placeholder: '例: A*, A, B, C' })}</label>
              <button type="button" disabled={!!busy.core} onClick={fetchCore}>{busy.core ? '検索中…' : '自動検索'}</button>
            </div>
          </div>
          <CoreResults result={core} onPick={(rank) => { set('core', rank); setCore(null); toast('CORE ' + rank + ' を設定しました'); }} />
        </div>
        </>
        )}

        <label className="field full">URL {text('url', { type: 'url' })}</label>
        <label className="field">BibTeX キー {text('bibkey', { placeholder: '空欄なら第一著者+年で自動生成' })}</label>
        <label className="field">読了状態
          <select name="read" value={f.read} onChange={(ev) => set('read', ev.target.value)}>
            {READ_STATES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <TagPicker tags={data.tags} selected={tags} busy={!!busy.tags} onSuggest={suggest}
          onToggle={(t) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))} />
        {!entry && projectChoices.length > 0 && (
          <ProjectPicker projects={projectChoices} selected={projects} onChange={setProjects} />
        )}
        <label className="field full">メモ
          <textarea name="note" placeholder="自分用コメント・自研究との関連など" value={f.note} onChange={(ev) => set('note', ev.target.value)} />
        </label>
      </div>
      <div className="dialog-actions">
        <button type="button" className="cancel" onClick={onClose}>キャンセル</button>
        <button type="submit" className="submit" disabled={!!busy.submit}>保存する</button>
      </div>
    </form>
  );
}
