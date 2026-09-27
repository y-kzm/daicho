import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { rangeBetween } from '../lib/keys';
import { useAppData } from './AppDataContext';

export interface SelectionValue {
  selected: Set<number>;
  focusId: number | null;
  toggle(id: number): void;
  selectOnly(id: number): void;
  /** ヘッダのチェックボックス用 */
  selectMany(ids: number[]): void;
  clear(): void;
  setFocus(id: number | null): void;
  /** フォーカス位置から toId までを選択し、フォーカスを toId に移す */
  range(toId: number, ordered: number[]): void;
}

const Ctx = createContext<SelectionValue | null>(null);

/** 画面ごとに新しく張る (契約 §5) */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const { data } = useAppData();
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [focusId, setFocusId] = useState<number | null>(null);

  // 削除・マージで消えたエントリを選択とフォーカスから外す
  useEffect(() => {
    const alive = new Set(data.entries.map((e) => e.id));
    setSelected((s) => {
      const next = new Set([...s].filter((id) => alive.has(id)));
      return next.size === s.size ? s : next;
    });
    setFocusId((f) => (f !== null && !alive.has(f) ? null : f));
  }, [data.entries]);

  const toggle = useCallback((id: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setFocusId(id);
  }, []);
  const selectOnly = useCallback((id: number) => { setSelected(new Set([id])); setFocusId(id); }, []);
  const selectMany = useCallback((ids: number[]) => setSelected(new Set(ids)), []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const setFocus = useCallback((id: number | null) => setFocusId(id), []);
  const range = useCallback((toId: number, ordered: number[]) => {
    setSelected(new Set(rangeBetween(ordered, focusId, toId)));
    setFocusId(toId);
  }, [focusId]);

  const value = useMemo<SelectionValue>(
    () => ({ selected, focusId, toggle, selectOnly, selectMany, clear, setFocus, range }),
    [selected, focusId, toggle, selectOnly, selectMany, clear, setFocus, range],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSelection(): SelectionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSelection must be used inside SelectionProvider');
  return v;
}
