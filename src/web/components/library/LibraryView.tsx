import { useCallback, useEffect, useMemo } from 'react';
import type { GroupKey, SortKey } from '../../../shared/types';
import { applyQuery, isFilteringBeyond, sourceQuery } from '../../lib/smart';
import { STORAGE_KEYS } from '../../lib/storage';
import {
  collapseKey, collapsedSet, DEFAULT_COLUMNS, effectiveGroup, groupEntries, groupKeysFor, nextSort, visibleIds, type ColumnKey,
} from '../../lib/table';
import { useAppData } from '../../state/AppDataContext';
import { useDialogs } from '../../state/DialogContext';
import { useLibrary } from '../../state/LibraryContext';
import { useScope } from '../../state/ScopeContext';
import { SelectionProvider, useSelection } from '../../state/SelectionContext';
import { useLocalState, useSessionState } from '../../state/useUiState';
import { BulkBar } from '../BulkBar';
import { CardGrid } from '../CardGrid';
import { DetailPanel } from '../DetailPanel';
import { EntryTable, type TableSort } from '../EntryTable';
import { FilterBar, FilterChips } from '../FilterBar';
import { AddEntryPicker } from '../project/AddEntryPicker';
import '../project/project.css';
import { scopeColumns } from './scopeColumns';
import { useListKeys } from './useListKeys';
import { ViewControls, type ViewMode } from './ViewControls';

/** プロジェクトの一覧では「プロジェクト数」の代わりに引用状態の列を出す */
const HIDDEN_IN_PROJECT: ColumnKey[] = ['projects'];

export function LibraryView() {
  return (
    <SelectionProvider>
      <LibraryInner />
    </SelectionProvider>
  );
}

function LibraryInner() {
  const { data } = useAppData();
  const { scope, project, entries: pool, apply } = useScope();
  const { query, setQuery, source, detailId, setDetailId, selectSource } = useLibrary();
  const { setFocus } = useSelection();
  const { open: openDialog } = useDialogs();
  const [view, setView] = useSessionState<ViewMode>(STORAGE_KEYS.view, 'table');
  const [storedColumns, setColumns] = useLocalState<ColumnKey[]>(STORAGE_KEYS.columns, DEFAULT_COLUMNS);
  const [collapsedList, setCollapsedList] = useSessionState<string[]>(STORAGE_KEYS.collapsed, []);
  const projectId = scope ?? undefined;
  const allColumns = Array.isArray(storedColumns) ? storedColumns : DEFAULT_COLUMNS;
  const columns = projectId === undefined ? allColumns : allColumns.filter((c) => !HIDDEN_IN_PROJECT.includes(c));
  const extraColumns = useMemo(() => (projectId === undefined ? [] : scopeColumns(projectId)), [projectId]);

  const now = useMemo(() => new Date(), [data]);
  const entries = useMemo(() => applyQuery(pool, apply(query), now), [pool, apply, query, now]);
  const groupBy: GroupKey = effectiveGroup(query.groupBy ?? 'none', projectId);
  const groups = useMemo(() => groupEntries(entries, groupBy, projectId), [entries, groupBy, projectId]);
  const collapsed = useMemo(() => collapsedSet(collapsedList, groupBy), [collapsedList, groupBy]);
  const ordered = useMemo(() => visibleIds(groups, collapsed), [groups, collapsed]);
  const sort: TableSort = { key: query.sort ?? 'added', dir: query.sortDir ?? 'desc' };

  const openDetail = useCallback((id: number) => { setFocus(id); setDetailId(id); }, [setFocus, setDetailId]);
  const closeDetail = useCallback(() => setDetailId(null), [setDetailId]);
  // パレットなど外から詳細を開いたときもフォーカスを合わせる
  useEffect(() => { if (detailId !== null) setFocus(detailId); }, [detailId, setFocus]);
  useListKeys({ ordered, detailOpen: detailId !== null, onOpen: openDetail, onCloseDetail: closeDetail });

  const toggleGroup = (key: string) => {
    const k = collapseKey(groupBy, key);
    setCollapsedList((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));
  };
  const onHeaderSort = (key: SortKey) => setQuery((q) => {
    const s = nextSort({ key: q.sort ?? 'added', dir: q.sortDir ?? 'desc' }, key);
    return { ...q, sort: s.key, sortDir: s.dir };
  });
  const onTagClick = (t: string) => setQuery((q) => (q.tags?.includes(t) ? q : { ...q, tags: [...(q.tags ?? []), t] }));
  const clearFilters = () => {
    // 表示元そのものの条件 (★ / 未分類 / タグなど) は残して、上乗せした絞り込みだけ外す
    const base = sourceQuery(source, data.savedFilters, now);
    if (isFilteringBeyond(query, base)) setQuery((q) => ({ ...base, sort: q.sort, sortDir: q.sortDir, groupBy: q.groupBy }));
    else selectSource({ kind: 'builtin', id: 'all' });
  };
  const addNew = () => openDialog({ kind: 'entry', id: null });

  return (
    <div className="library">
      <div className="lib-main">
        <div className="lib-tools">
          <FilterBar />
          <div className="lib-tools-right">
            <ViewControls view={view} onView={setView} groupBy={groupBy} groupKeys={groupKeysFor(projectId)}
              onGroupBy={(g) => setQuery((q) => ({ ...q, groupBy: g }))}
              sort={sort} onSort={(s) => setQuery((q) => ({ ...q, sort: s.key, sortDir: s.dir }))}
              columns={allColumns} hiddenColumns={projectId === undefined ? [] : HIDDEN_IN_PROJECT} onColumns={setColumns} />
            {projectId !== undefined && (
              <AddEntryPicker projectId={projectId} label="ライブラリから追加" onPicked={(ids) => { if (ids[0] !== undefined) openDetail(ids[0]); }} />
            )}
          </div>
        </div>
        <FilterChips />
        <BulkBar />
        {pool.length === 0 && projectId !== undefined ? (
          <div className="empty">
            このプロジェクトには、まだ論文がありません
            <div className="empty-actions">
              <button type="button" className="hbtn primary" onClick={addNew}>新しい論文を登録</button>
            </div>
            <div className="empty-note">登録済みの論文は、上の「ライブラリから追加」で「{project?.name}」に入れられます。</div>
          </div>
        ) : entries.length === 0 ? (
          <div className="empty">
            該当する論文はありません
            <div><button type="button" className="hbtn" onClick={clearFilters}>フィルタを解除</button></div>
          </div>
        ) : view === 'table' ? (
          <EntryTable entries={entries} groups={groups} columns={columns} sort={sort} onSort={onHeaderSort}
            collapsed={collapsed} onToggleGroup={toggleGroup} onOpen={openDetail} extraColumns={extraColumns} />
        ) : (
          <CardGrid groups={groups} collapsed={collapsed} onToggleGroup={toggleGroup} onOpen={openDetail} onTagClick={onTagClick} />
        )}
      </div>
      {detailId !== null && (
        <DetailPanel entryId={detailId} projectId={projectId} onClose={closeDetail} onEdit={(id) => openDialog({ kind: 'entry', id })} />
      )}
    </div>
  );
}
