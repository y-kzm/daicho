import { useCallback, useState } from 'react';
import { browserStorage, readStored, writeStored } from '../lib/storage';

type Setter<T> = (v: T | ((p: T) => T)) => void;

function usePersisted<T>(kind: 'session' | 'local', key: string, initial: T): [T, Setter<T>] {
  const [value, setValue] = useState<T>(() => readStored(browserStorage(kind), key, initial));
  const set = useCallback<Setter<T>>((v) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
      writeStored(browserStorage(kind), key, next);
      return next;
    });
  }, [kind, key]);
  return [value, set];
}

/** 画面 UI 状態 (タブを閉じると消える) */
export function useSessionState<T>(key: string, initial: T): [T, Setter<T>] {
  return usePersisted('session', key, initial);
}

/** 列設定など、ブラウザに残したい UI 状態 */
export function useLocalState<T>(key: string, initial: T): [T, Setter<T>] {
  return usePersisted('local', key, initial);
}
