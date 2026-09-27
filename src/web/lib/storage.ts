/** sessionStorage / localStorage の JSON 読み書き。ブラウザ設定で無効でも例外を外に出さない。 */
export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const STORAGE_KEYS = {
  source: 'daicho.library.source',
  query: 'daicho.library.query',
  view: 'daicho.library.view',
  columns: 'daicho.library.columns',
  collapsed: 'daicho.library.groups.collapsed',
  detail: 'daicho.detail.open',
} as const;

export function readStored<T>(storage: StorageLike | null, key: string, initial: T): T {
  if (!storage) return initial;
  try {
    const raw = storage.getItem(key);
    return raw === null ? initial : (JSON.parse(raw) as T);
  } catch {
    return initial;
  }
}

export function writeStored<T>(storage: StorageLike | null, key: string, value: T): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // 容量超過・プライベートモードでは保存しない (画面の動作は続ける)
  }
}

export function browserStorage(kind: 'session' | 'local'): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}
