import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { VenueData } from '../../shared/venues';
import { useToast } from '../state/useToast';
import { venuesApi } from './api';

export interface VenuesValue {
  data: VenueData;
  /** サーバーが返した最新の内容に置き換える */
  apply: (d: VenueData) => void;
  reload: () => Promise<void>;
  /** 失敗を通知にして、成功したかどうかを返す */
  run: (fn: () => Promise<VenueData>, done?: string) => Promise<boolean>;
}

const Ctx = createContext<VenuesValue | null>(null);

/** 会議・論文誌の区画を開いたときにだけ読み込む (論文の台帳の読み込みには含めない) */
export function VenuesProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<VenueData | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  useEffect(() => { void reload(); }, [reload]);

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

  const value = useMemo<VenuesValue | null>(() => (data ? { data, apply, reload, run } : null), [data, apply, reload, run]);
  if (!value) {
    return error
      ? (
        <div className="empty">
          読み込みに失敗しました: {error}
          <div><button type="button" className="hbtn" onClick={() => void reload()}>再読み込み</button></div>
        </div>
      )
      : <div className="empty"><span className="spin" />読み込み中…</div>;
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVenues(): VenuesValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVenues must be used inside VenuesProvider');
  return v;
}
