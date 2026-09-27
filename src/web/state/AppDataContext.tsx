import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData, Entry, Project } from '../../shared/types';
import { api } from '../api';
import { useToast } from './useToast';

export interface AppDataValue {
  data: AppData;
  reload: () => Promise<void>;
  applyData: (d: AppData) => void;
  /** 1 件だけ楽観更新する (★・優先度・読了・タグ・メモ・所属の即時反映用) */
  patchEntry: (id: number, patch: Partial<Entry>) => void;
  projectById: (id: number) => Project | undefined;
}

const Ctx = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  // 後から始まった読み込み / applyData を、先に始まって遅れて返ってきた reload が上書きしないように
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const d = await api.data();
      if (my === seq.current) setData(d);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast(msg, true);
    }
  }, [toast]);

  useEffect(() => { void reload(); }, [reload]);

  const patchEntry = useCallback((id: number, patch: Partial<Entry>) => {
    setData((d) => (d ? { ...d, entries: d.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : d));
  }, []);
  const applyData = useCallback((d: AppData) => {
    seq.current++;
    setData(d);
  }, []);

  const projects = data?.projects;
  const projectById = useMemo(() => {
    const map = new Map((projects ?? []).map((p) => [p.id, p]));
    return (id: number) => map.get(id);
  }, [projects]);

  const value = useMemo<AppDataValue | null>(
    () => (data ? { data, reload, applyData, patchEntry, projectById } : null),
    [data, reload, applyData, patchEntry, projectById],
  );

  if (!value) {
    if (error) {
      return (
        <div id="loading">
          <div>読み込みに失敗しました: {error}</div>
          <button className="hbtn" onClick={() => { setError(null); void reload(); }}>再読み込み</button>
        </div>
      );
    }
    return (
      <div id="loading">
        <span className="spin" />読み込み中…
      </div>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppDataValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData must be used inside AppDataProvider');
  return v;
}
