import { useMemo, useSyncExternalStore } from 'react';

/**
 * scope = 開いているプロジェクトの id。無ければ全体 (すべての文献)。
 * project はそのプロジェクトのカンバン画面で、id がそのまま scope になる。
 */
export type Route =
  | { name: 'library'; scope?: number }
  | { name: 'stats'; scope?: number }
  | { name: 'project'; id: number };

function toId(s: string | undefined): number | undefined {
  if (!s || !/^[1-9]\d*$/.test(s)) return undefined;
  const id = Number(s);
  return Number.isSafeInteger(id) ? id : undefined;
}

/**
 * `#/library` (既定) / `#/stats` / `#/project/:id` (カンバン) /
 * `#/project/:id/library` / `#/project/:id/stats`。解釈できないものはすべて全体の library
 */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '/stats') return { name: 'stats' };
  const m = path.match(/^\/project\/(\d+)(?:\/(library|stats))?$/);
  const id = toId(m?.[1]);
  if (m && id !== undefined) {
    if (m[2] === 'library') return { name: 'library', scope: id };
    if (m[2] === 'stats') return { name: 'stats', scope: id };
    return { name: 'project', id };
  }
  return { name: 'library' };
}

export function toHash(r: Route): string {
  switch (r.name) {
    case 'project': return `#/project/${r.id}`;
    case 'stats': return r.scope === undefined ? '#/stats' : `#/project/${r.scope}/stats`;
    default: return r.scope === undefined ? '#/library' : `#/project/${r.scope}/library`;
  }
}

/** ルートが指すプロジェクトの id。全体なら null */
export function scopeOf(r: Route): number | null {
  if (r.name === 'project') return r.id;
  return r.scope ?? null;
}

/** 同じ種類の画面を別のスコープで開く (カンバンは全体に無いので一覧にする) */
export function withScope(r: Route, scope: number | null): Route {
  const s = scope ?? undefined;
  if (r.name === 'stats') return s === undefined ? { name: 'stats' } : { name: 'stats', scope: s };
  if (r.name === 'project' && s !== undefined) return { name: 'project', id: s };
  return s === undefined ? { name: 'library' } : { name: 'library', scope: s };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  return useMemo(() => parseHash(hash), [hash]);
}

export function navigate(r: Route): void {
  const h = toHash(r);
  if (window.location.hash !== h) window.location.hash = h;
}
