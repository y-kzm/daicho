import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Entry, FilterQuery, Project } from '../../shared/types';
import { countTags, scopeEntries, scopeQuery, scopeTags } from '../lib/scope';
import { useAppData } from './AppDataContext';

/**
 * 今開いている範囲。scope が null なら「すべての文献」、数値ならそのプロジェクト。
 * 論文の実体は全体で 1 つ (useAppData) のままで、ここでは見せる範囲だけを絞る。
 */
export interface ScopeValue {
  scope: number | null;
  project: Project | undefined;
  /** この範囲の論文 */
  entries: Entry[];
  /** この範囲で使われているタグ (全体のタグ順) */
  tags: string[];
  tagCount: ReadonlyMap<string, number>;
  /** 条件をこの範囲で評価する形にする (プロジェクトを固定する) */
  apply: <Q extends FilterQuery>(q: Q) => Q;
}

const Ctx = createContext<ScopeValue | null>(null);

export function ScopeProvider({ scope, children }: { scope: number | null; children: ReactNode }) {
  const { data, projectById } = useAppData();
  const value = useMemo<ScopeValue>(() => {
    const entries = scopeEntries(data.entries, scope);
    return {
      scope,
      project: scope === null ? undefined : projectById(scope),
      entries,
      tags: scopeTags(data.tags, entries, scope),
      tagCount: countTags(entries),
      apply: (q) => scopeQuery(q, scope),
    };
  }, [data.entries, data.tags, projectById, scope]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScope(): ScopeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useScope must be used inside ScopeProvider');
  return v;
}
