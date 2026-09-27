import { useEffect, useState } from 'react';
import type { Entry, EntryInput, Priority, ReadState } from '../../shared/types';
import { PRIORITIES, PRIORITY_LABELS, READ_STATES } from '../../shared/types';
import { api } from '../api';
import { venueOf } from '../lib/table';
import { useAppData } from '../state/AppDataContext';
import { useDialogs } from '../state/DialogContext';
import { useToast } from '../state/useToast';
import { TagPicker } from './dialogs/TagPicker';
import { VenuePills } from './EntryCard';
import { DetailFiles } from './library/DetailFiles';
import { DetailProjects } from './library/DetailProjects';
import { toEntryInput } from './library/entryInput';
import { useEntryActions } from './library/useEntryActions';
import { SummaryText } from './SummaryText';

interface Props {
  entryId: number | null;
  /** プロジェクト画面 (計画 C) から使うとき。memo 欄が出る */
  projectId?: number;
  onClose: () => void;
  onEdit: (id: number) => void;
}

/** http(s) の URL だけリンクにする (javascript: などを踏ませない) */
const isWebUrl = (u: string): boolean => /^https?:\/\//i.test(u);

const META: [string, (e: Entry) => string][] = [
  ['DOI', (e) => e.doi],
  ['BibTeX キー', (e) => e.bibkey],
  ['出版国', (e) => e.country],
  ['出版社', (e) => e.publisher],
  ['追加日', (e) => e.added],
  ['最近開いた', (e) => e.lastOpenedAt.replace('T', ' ').slice(0, 16)],
];

const TOUCH_DELAY_MS = 800;

export function DetailPanel({ entryId, projectId, onClose, onEdit }: Props) {
  const { data } = useAppData();

  // 同じ論文を 800ms 開いたままにしたら「最近開いた」を記録する。
  // 矢印キーで流し見しただけでは記録しない。ローカルには反映せず、次の reload() で取り込む
  // (開いている間に 最近開いた 順の並びが入れ替わらないように)。
  useEffect(() => {
    if (entryId === null) return;
    const timer = setTimeout(() => {
      api.touch(entryId).catch(() => { /* 記録に失敗しても閲覧は続けられるので通知しない */ });
    }, TOUCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [entryId]);

  const e = entryId === null ? undefined : data.entries.find((x) => x.id === entryId);
  if (!e) return null;
  return (
    <aside className="detail-panel" aria-label="論文の詳細">
      <DetailBody key={e.id} e={e} projectId={projectId} onClose={onClose} onEdit={onEdit} />
    </aside>
  );
}

function DetailBody({ e, projectId, onClose, onEdit }: { e: Entry; projectId?: number; onClose: () => void; onEdit: (id: number) => void }) {
  const { data, patchEntry, reload } = useAppData();
  const { open } = useDialogs();
  const toast = useToast();
  const actions = useEntryActions();
  const [note, setNote] = useState(e.note);
  useEffect(() => setNote(e.note), [e.note]);

  const read = (e.read || '未読') as ReadState;
  const link = e.url || (e.doi ? 'https://doi.org/' + e.doi : '');
  const venue = venueOf(e) || e.publisher;

  const save = async (patch: Partial<EntryInput>, done?: string) => {
    const input = { ...toEntryInput(e), ...patch };
    patchEntry(e.id, patch);
    try {
      await api.updateEntry(e.id, input);
      if (done) toast(done);
    } catch (err) {
      toast((err as Error).message, true);
      void reload();
    }
  };
  const toggleTag = (t: string) => void save({ tags: e.tags.includes(t) ? e.tags.filter((x) => x !== t) : [...e.tags, t] });
  const saveNote = () => { if (note !== e.note) void save({ note }, 'メモを保存しました'); };
  const remove = () => open({
    kind: 'confirm', title: '論文を削除', body: `「${e.title}」を削除します。元に戻せません。`, confirmLabel: '削除する',
    onConfirm: async () => { await api.deleteEntry(e.id); await reload(); onClose(); toast('削除しました'); },
  });

  return (
    <>
      <div className="dp-head">
        <button type="button" className={'star-btn' + (e.starred ? ' on' : '')} title="★ を切り替え (s)" onClick={() => actions.toggleStar(e)}>
          {e.starred ? '★' : '☆'}
        </button>
        <h2 className="dp-title">{isWebUrl(link) ? <a href={link} target="_blank" rel="noopener">{e.title}</a> : e.title}</h2>
        <button type="button" className="dp-close" aria-label="詳細を閉じる" title="閉じる (Esc)" onClick={onClose}>×</button>
      </div>
      <div className="dp-venue">
        {[e.year, venue].filter(Boolean).join(' · ')}
        <VenuePills e={e} />
      </div>
      <div className="dp-controls">
        <label>読了
          <select className={'read r' + READ_STATES.indexOf(read)} value={read} onChange={(ev) => actions.setRead(e, ev.target.value as ReadState)}>
            {READ_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>優先度
          <select value={e.priority} onChange={(ev) => actions.setPriority(e, Number(ev.target.value) as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p === 0 ? 'なし' : PRIORITY_LABELS[p]}</option>)}
          </select>
        </label>
      </div>

      <section className="dp-sec">
        <h3>タグ</h3>
        <TagPicker tags={data.tags} selected={e.tags} onToggle={toggleTag} />
      </section>

      <section className="dp-sec">
        <h3>メモ</h3>
        <textarea className="dp-note" aria-label="メモ" placeholder="自分用コメント・自研究との関連など" value={note}
          onChange={(ev) => setNote(ev.target.value)} onBlur={saveNote} />
      </section>

      <DetailProjects e={e} projectId={projectId} />

      <DetailFiles e={e} />

      {e.summary && (
        <section className="dp-sec e-detail open">
          <h3>概要</h3>
          <SummaryText text={e.summary} />
        </section>
      )}

      <section className="dp-sec">
        <h3>情報</h3>
        <dl className="dp-meta">
          {META.filter(([, get]) => get(e)).map(([label, get]) => (
            <div key={label}><dt>{label}</dt><dd className="mono">{get(e)}</dd></div>
          ))}
        </dl>
      </section>

      <div className="dp-actions">
        <button type="button" className="hbtn" onClick={() => onEdit(e.id)}>編集</button>
        <button type="button" className="hbtn danger" onClick={remove}>削除</button>
      </div>
    </>
  );
}
