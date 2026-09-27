import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DriveStatus } from '../../shared/types';
import { api } from '../api';
import { useToast } from './useToast';

export interface DriveValue {
  /** null = 確認中、または確認に失敗 */
  status: DriveStatus | null;
  refresh: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const Ctx = createContext<DriveValue | null>(null);

/** Google の同意画面から戻ってきたときの結果 (`/?drive=...`) */
const RETURN_MESSAGES: Record<string, [string, boolean]> = {
  connected: ['Google Drive に接続しました', false],
  denied: ['Google Drive への接続を取りやめました', true],
  error: ['Google Drive に接続できませんでした。もう一度やり直してください。', true],
};

export function DriveProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.driveStatus());
    } catch {
      setStatus(null); // PDF 欄に「確認できません」と出す。ほかの機能は使える
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // 戻ってきた結果を 1 回だけ知らせ、URL から消す (再読み込みで繰り返さない)
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('drive');
    if (result === null) return;
    url.searchParams.delete('drive');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    const m = RETURN_MESSAGES[result];
    if (m) toast(m[0], m[1]);
  }, [toast]);

  const disconnect = useCallback(async () => {
    await api.driveDisconnect();
    await refresh();
  }, [refresh]);

  const value = useMemo<DriveValue>(() => ({ status, refresh, disconnect }), [status, refresh, disconnect]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDrive(): DriveValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDrive must be used inside DriveProvider');
  return v;
}
