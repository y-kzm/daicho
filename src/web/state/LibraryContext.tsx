import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { FilterQuery } from '../../shared/types';
import { DEFAULT_QUERY, sourceQuery, type LibrarySource } from '../lib/smart';
import { STORAGE_KEYS } from '../lib/storage';
import { useAppData } from './AppDataContext';
import { useSessionState } from './useUiState';

export interface LibraryValue {
  source: LibrarySource;
  query: FilterQuery;
  /** 詳細パネルで開いている entry id */
  detailId: number | null;
  setQuery: (q: FilterQuery | ((p: FilterQuery) => FilterQuery)) => void;
  /** 表示元を切り替える。query を省略すると表示元の既定条件にする */
  selectSource: (src: LibrarySource, query?: FilterQuery) => void;
  setDetailId: (id: number | null) => void;
}

const ALL: LibrarySource = { kind: 'builtin', id: 'all' };
const Ctx = createContext<LibraryValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { data, projectById } = useAppData();
  const [source, setSource] = useSessionState<LibrarySource>(STORAGE_KEYS.source, ALL);
  const [query, setQuery] = useSessionState<FilterQuery>(STORAGE_KEYS.query, DEFAULT_QUERY);
  const [detailId, setDetailId] = useSessionState<number | null>(STORAGE_KEYS.detail, null);
  const savedFilters = data.savedFilters;

  const selectSource = useCallback((src: LibrarySource, q?: FilterQuery) => {
    setSource(src);
    setQuery(q ?? sourceQuery(src, savedFilters, new Date()));
  }, [savedFilters, setSource, setQuery]);

  // 削除された保存フィルタ・タグを表示元にしていたらライブラリ全体へ戻す
  useEffect(() => {
    const gone = (source.kind === 'saved' && !data.savedFilters.some((f) => f.id === source.id))
      || (source.kind === 'tag' && !data.tags.includes(source.name));
    if (gone) selectSource(ALL);
  }, [data.savedFilters, data.tags, source, selectSource]);

  // 削除されたタグ・プロジェクトを条件から外す
  useEffect(() => {
    setQuery((q) => {
      const tags = q.tags?.filter((t) => data.tags.includes(t));
      const projectGone = q.projectId !== undefined && !projectById(q.projectId);
      if (!projectGone && (tags?.length ?? 0) === (q.tags?.length ?? 0)) return q;
      return { ...q, tags: tags?.length ? tags : undefined, projectId: projectGone ? undefined : q.projectId };
    });
  }, [data.tags, projectById, setQuery]);

  // 削除されたエントリの詳細パネルを閉じる
  useEffect(() => {
    if (detailId !== null && !data.entries.some((e) => e.id === detailId)) setDetailId(null);
  }, [data.entries, detailId, setDetailId]);

  const value = useMemo<LibraryValue>(
    () => ({ source, query, detailId, setQuery, selectSource, setDetailId }),
    [source, query, detailId, setQuery, selectSource, setDetailId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibrary(): LibraryValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLibrary must be used inside LibraryProvider');
  return v;
}
