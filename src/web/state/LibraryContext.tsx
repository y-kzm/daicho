import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { FilterQuery } from '../../shared/types';
import { navigate } from '../lib/router';
import { scopedKey } from '../lib/scope';
import { DEFAULT_QUERY, sourceQuery, type LibrarySource } from '../lib/smart';
import { browserStorage, STORAGE_KEYS, writeStored } from '../lib/storage';
import { useAppData } from './AppDataContext';
import { useScope } from './ScopeContext';
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
  /** 指定した範囲 (null = 全体) の一覧で、その論文の詳細を開く */
  openEntryIn: (scope: number | null, id: number) => void;
}

const ALL: LibrarySource = { kind: 'builtin', id: 'all' };
const Ctx = createContext<LibraryValue | null>(null);

/** scope ごとに `key` を変えて作り直すこと (保存先のキーは初回にだけ読む) */
export function LibraryProvider({ scope, children }: { scope: number | null; children: ReactNode }) {
  const { data, projectById } = useAppData();
  const { entries: scoped } = useScope();
  const [source, setSource] = useSessionState<LibrarySource>(scopedKey(STORAGE_KEYS.source, scope), ALL);
  const [query, setQuery] = useSessionState<FilterQuery>(scopedKey(STORAGE_KEYS.query, scope), DEFAULT_QUERY);
  const [detailId, setDetailId] = useSessionState<number | null>(scopedKey(STORAGE_KEYS.detail, scope), null);
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

  // 削除されたエントリ、開いているプロジェクトから外れたエントリの詳細パネルを閉じる
  useEffect(() => {
    if (detailId !== null && !scoped.some((e) => e.id === detailId)) setDetailId(null);
  }, [scoped, detailId, setDetailId]);

  const openEntryIn = useCallback((target: number | null, id: number) => {
    if (target === scope) setDetailId(id);
    // 別の範囲は Provider ごと作り直されるので、その範囲の保存先へ先に書いておく
    else writeStored(browserStorage('session'), scopedKey(STORAGE_KEYS.detail, target), id);
    navigate(target === null ? { name: 'library' } : { name: 'library', scope: target });
  }, [scope, setDetailId]);

  const value = useMemo<LibraryValue>(
    () => ({ source, query, detailId, setQuery, selectSource, setDetailId, openEntryIn }),
    [source, query, detailId, setQuery, selectSource, setDetailId, openEntryIn],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibrary(): LibraryValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLibrary must be used inside LibraryProvider');
  return v;
}
