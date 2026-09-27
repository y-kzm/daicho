import type { FilterQuery } from '../../shared/types';
import { api } from '../api';
import { sortByOrder } from '../lib/order';
import { activeFilters, isFilteringBeyond, normalizeTagMode, sourceQuery, toSavedQuery } from '../lib/smart';
import { useAppData } from '../state/AppDataContext';
import { useDialogs } from '../state/DialogContext';
import { useLibrary } from '../state/LibraryContext';
import { useScope } from '../state/ScopeContext';
import { useToast } from '../state/useToast';
import { FilterPanel } from './library/FilterPanel';
import { Popover } from './Popover';

/** 表示元 (★ / タグ / 保存フィルタなど) と、そこからの変更 */
function useFilters() {
  const { data, projectById } = useAppData();
  const { query, setQuery, source } = useLibrary();
  // 解除しても ★ / 未分類 / タグ など表示元そのものの条件は残す
  const base = sourceQuery(source, data.savedFilters, new Date());
  const chips = activeFilters(query, base, (id) => projectById(id)?.name);
  // 条件を足した場合だけでなく、表示元の条件を外した・緩めた場合も含む
  const changed = isFilteringBeyond(query, base);
  return { query, setQuery, source, base, chips, changed };
}

/** ツールバーの左側: 検索欄と「絞り込み」 */
export function FilterBar() {
  const { data } = useAppData();
  const { scope, tags } = useScope();
  const { query, setQuery, base, chips, changed } = useFilters();
  const set = (patch: Partial<FilterQuery>) => setQuery((q) => normalizeTagMode({ ...q, ...patch }, base));
  // 検索語は検索欄に見えているので、件数には数えない
  const count = chips.filter((c) => c.key !== 'search').length;
  const label = (
    <>
      絞り込み
      {count > 0 && <span className="badge">{count}</span>}
    </>
  );

  return (
    <div className="filterbar">
      <input type="search" className="f-search" aria-label="検索語で絞り込む" placeholder="タイトル・概要・メモ・DOI・タグで絞り込む"
        value={query.search ?? ''} onChange={(ev) => set({ search: ev.target.value || undefined })} />
      <Popover label={label} className={'hbtn' + (count > 0 || changed ? ' on' : '')} align="right" title="条件を選んで絞り込む">
        {() => (
          <FilterPanel query={query} tags={tags} onChange={set}
            projects={scope === null ? sortByOrder(data.projects) : []} />
        )}
      </Popover>
    </div>
  );
}

/** ツールバーの下: 使用中の条件と、保存フィルタの操作。表示元のままなら何も出さない */
export function FilterChips() {
  const { data, reload } = useAppData();
  const { query, setQuery, source, base, chips, changed } = useFilters();
  const { open } = useDialogs();
  const toast = useToast();
  const saved = source.kind === 'saved' ? data.savedFilters.find((f) => f.id === source.id) : undefined;
  // 保存フィルタは並び順とグループも保存するので、それだけを変えた場合も「更新」できるようにする
  const differs = JSON.stringify(toSavedQuery(query)) !== JSON.stringify(toSavedQuery(base));
  if (!chips.length && !changed && !saved) return null;

  const reset = () => setQuery((q) => ({ ...base, sort: q.sort, sortDir: q.sortDir, groupBy: q.groupBy }));
  const save = (editing: typeof saved | null) => open({ kind: 'saveFilter', query: toSavedQuery(query), editing: editing ?? null });
  const removeSaved = () => {
    if (!saved) return;
    open({
      kind: 'confirm', title: '保存フィルタを削除', body: `「${saved.name}」を削除します。論文は削除されません。`, confirmLabel: '削除する',
      onConfirm: async () => { await api.deleteFilter(saved.id); await reload(); toast('削除しました'); },
    });
  };

  return (
    <div className="chips-row">
      {chips.map((c) => (
        <span key={c.key} className="chip on removable">
          {c.label}
          <button type="button" aria-label={`${c.label} を外す`} title="この条件を外す" onClick={() => setQuery((q) => c.clear(q))}>×</button>
        </span>
      ))}
      {changed && !chips.length && <span className="chips-note">表示元の条件を変更しています</span>}
      {changed && <button type="button" className="linkbtn" onClick={reset}>{chips.length > 1 ? 'すべて解除' : '元の条件に戻す'}</button>}
      <span className="spacer" />
      {changed && <button type="button" className="linkbtn" onClick={() => save(null)}>フィルタを保存</button>}
      {saved && differs && <button type="button" className="linkbtn" onClick={() => save(saved)}>「{saved.name}」を更新</button>}
      {saved && <button type="button" className="linkbtn danger" onClick={removeSaved}>保存フィルタを削除</button>}
    </div>
  );
}
