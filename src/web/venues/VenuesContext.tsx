import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { VenueData } from '../../shared/venues';
import { useToast } from '../state/useToast';
import { venuesApi } from './api';

/** 読み込みの前から使える部分。サイドバーは、読み込みを待たずにこれを見る */
export interface VenueStore {
  data: VenueData | null;
  error: string | null;
  /** 詳細を開いている会議・論文誌 */
  selectedId: number | null;
  select: (id: number | null) => void;
  /** サーバーが返した最新の内容に置き換える */
  apply: (d: VenueData) => void;
  reload: () => Promise<void>;
  /** 失敗を通知にして、成功したかどうかを返す */
  run: (fn: () => Promise<VenueData>, done?: string) => Promise<boolean>;
}

export type VenuesValue = VenueStore & { data: VenueData };

const Ctx = createContext<VenueStore | null>(null);

/**
 * 国際会議と論文誌のデータ。画面とサイドバーの両方から使うので、全体を囲む位置に置く。
 * 読み込むのは、その区画を初めて開いたとき (論文の台帳の読み込みには含めない)。
 */
export function VenuesProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const [data, setData] = useState<VenueData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, select] = useState<number | null>(null);
  const [wanted, setWanted] = useState(active);
  const toast = useToast();

  const apply = useCallback((d: VenueData) => setData({ venues: d.venues, calendarToken: d.calendarToken }), []);
  const reload = useCallback(async () => {
    try {
      apply(await venuesApi.load());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [apply]);
  useEffect(() => { if (active) setWanted(true); }, [active]);
  useEffect(() => { if (wanted) void reload(); }, [wanted, reload]);

  const run = useCallback(async (fn: () => Promise<VenueData>, done?: string) => {
    try {
      apply(await fn());
      if (done) toast(done);
      return true;
    } catch (err) {
      toast((err as Error).message, true);
      return false;
    }
  }, [apply, toast]);

  const value = useMemo<VenueStore>(
    () => ({ data, error, selectedId, select, apply, reload, run }),
    [data, error, selectedId, apply, reload, run],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVenueStore(): VenueStore {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVenueStore must be used inside VenuesProvider');
  return v;
}

/** 読み込みが済むまでは、中身の代わりに状態を見せる */
export function VenuesGate({ children }: { children: ReactNode }) {
  const { data, error, reload } = useVenueStore();
  if (data) return <>{children}</>;
  return error
    ? (
      <div className="empty">
        読み込みに失敗しました: {error}
        <div><button type="button" className="hbtn" onClick={() => void reload()}>再読み込み</button></div>
      </div>
    )
    : <div className="empty"><span className="spin" />読み込み中…</div>;
}

/** 読み込みが済んだあとの画面で使う (VenuesGate の内側) */
export function useVenues(): VenuesValue {
  const v = useVenueStore();
  if (!v.data) throw new Error('useVenues must be used inside VenuesGate');
  return v as VenuesValue;
}
