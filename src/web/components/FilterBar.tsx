import type { CiteState, FilterQuery, Priority, ReadState } from '../../shared/types';
import { CITE_STATES, PRIORITY_LABELS, READ_STATES } from '../../shared/types';
import { api } from '../api';
import { sortByOrder } from '../lib/order';
import { isFilteringBeyond, sourceQuery, toSavedQuery } from '../lib/smart';
import { useAppData } from '../state/AppDataContext';
import { useDialogs } from '../state/DialogContext';
import { useLibrary } from '../state/LibraryContext';
import { useScope } from '../state/ScopeContext';
import { useToast } from '../state/useToast';
import { MultiPick } from './library/MultiPick';

const READ_OPTIONS = READ_STATES.map((s) => ({ value: s, label: s }));
const CITE_OPTIONS = CITE_STATES.map((s) => ({ value: s, label: s }));
const PRIORITY_OPTIONS = ([3, 2, 1, 0] as Priority[]).map((p) => ({ value: p, label: p === 0 ? 'なし' : PRIORITY_LABELS[p] }));

function toYear(v: string): number | undefined {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function FilterBar() {
  const { data, reload } = useAppData();
  const { query, setQuery, source } = useLibrary();
  const { scope, tags } = useScope();
  const { open } = useDialogs();
  const toast = useToast();
  const set = (patch: Partial<FilterQuery>) => setQuery((q) => ({ ...q, ...patch }));
  const saved = source.kind === 'saved' ? data.savedFilters.find((f) => f.id === source.id) : undefined;
  const projects = sortByOrder(data.projects);
  // 解除しても ★ / 未分類 / タグ など表示元そのものの条件は残す
  const base = sourceQuery(source, data.savedFilters, new Date());

  const removeSaved = () => {
    if (!saved) return;
    open({
      kind: 'confirm', title: '保存フィルタを削除', body: `「${saved.name}」を削除します。論文は削除されません。`, confirmLabel: '削除する',
      onConfirm: async () => { await api.deleteFilter(saved.id); await reload(); toast('削除しました'); },
    });
  };

  return (
    <div className="filterbar">
      <input type="search" className="f-search" aria-label="絞り込み" placeholder="絞り込み (タイトル・概要・メモ・DOI・タグ)"
        value={query.search ?? ''} onChange={(ev) => set({ search: ev.target.value || undefined })} />
      <MultiPick<ReadState> label="読了" options={READ_OPTIONS} selected={query.read} onChange={(read) => set({ read })} />
      <MultiPick<string> label="タグ" options={tags.map((t) => ({ value: t, label: t }))} selected={query.tags}
        onChange={(tags) => set({ tags })}
        footer={(
          <div className="seg f-tagmode" role="group" aria-label="タグの条件">
            <button type="button" className={query.tagMode !== 'all' ? 'on' : ''} onClick={() => set({ tagMode: undefined })}>いずれか</button>
            <button type="button" className={query.tagMode === 'all' ? 'on' : ''} onClick={() => set({ tagMode: 'all' })}>すべて</button>
          </div>
        )} />
      {/* プロジェクトを開いている間は、そのプロジェクトに固定されている */}
      {scope === null && (
        <select className={query.projectId !== undefined ? 'on' : ''} aria-label="プロジェクト" value={query.projectId ?? ''}
          onChange={(ev) => set({ projectId: ev.target.value ? Number(ev.target.value) : undefined })}>
          <option value="">プロジェクト: すべて</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.archived ? `${p.name} (アーカイブ)` : p.name}</option>)}
        </select>
      )}
      <MultiPick<CiteState> label="引用状態" options={CITE_OPTIONS} selected={query.cite} onChange={(cite) => set({ cite })} />
      <span className="f-years">
        年
        <input type="number" className="f-year" aria-label="年 (から)" placeholder="から" value={query.yearFrom ?? ''}
          onChange={(ev) => set({ yearFrom: toYear(ev.target.value) })} />
        〜
        <input type="number" className="f-year" aria-label="年 (まで)" placeholder="まで" value={query.yearTo ?? ''}
          onChange={(ev) => set({ yearTo: toYear(ev.target.value) })} />
      </span>
      <select className={query.starred !== undefined ? 'on' : ''} aria-label="★"
        value={query.starred === undefined ? '' : String(query.starred)}
        onChange={(ev) => set({ starred: ev.target.value === '' ? undefined : ev.target.value === 'true' })}>
        <option value="">★: すべて</option>
        <option value="true">★ あり</option>
        <option value="false">★ なし</option>
      </select>
      <MultiPick<Priority> label="優先度" options={PRIORITY_OPTIONS} selected={query.priority} onChange={(priority) => set({ priority })} />
      {isFilteringBeyond(query, base) && <button type="button" className="linkbtn f-clear" onClick={() => setQuery((q) => ({ ...base, sort: q.sort, sortDir: q.sortDir, groupBy: q.groupBy }))}>解除</button>}
      <span className="f-save">
        <button type="button" className="hbtn" onClick={() => open({ kind: 'saveFilter', query: toSavedQuery(query), editing: null })}>
          フィルタを保存
        </button>
        {saved && (
          <button type="button" className="hbtn" onClick={() => open({ kind: 'saveFilter', query: toSavedQuery(query), editing: saved })}>
            更新
          </button>
        )}
        {saved && <button type="button" className="hbtn danger" onClick={removeSaved}>削除</button>}
      </span>
    </div>
  );
}
