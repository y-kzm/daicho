import { useMemo, useSyncExternalStore } from 'react';

export type Route = { name: 'library' } | { name: 'project'; id: number } | { name: 'stats' };

/** `#/library` (既定) / `#/project/:id` / `#/stats`。解釈できないものはすべて library */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '/stats') return { name: 'stats' };
  const m = path.match(/^\/project\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    if (Number.isSafeInteger(id) && id > 0) return { name: 'project', id };
  }
  return { name: 'library' };
}

export function toHash(r: Route): string {
  switch (r.name) {
    case 'project': return `#/project/${r.id}`;
    case 'stats': return '#/stats';
    default: return '#/library';
  }
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
