import type { AppData, Entry } from '../../shared/types';
import { venueOf } from './table';

export type PaletteItem =
  | { kind: 'entry'; id: number; title: string; sub: string }
  | { kind: 'project'; id: number; name: string }
  | { kind: 'tag'; name: string }
  | { kind: 'command'; id: string; label: string };

const WORD_BOUNDARY = /[\s\-_:/().,[\]「」『』、。・]/;

/** 0 = 不一致, 1 = 部分一致, 2 = 単語先頭一致, 3 = 前方一致 (大文字小文字無視) */
export function scoreMatch(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 3;
  let found = false;
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + 1)) {
    if (i > 0 && WORD_BOUNDARY.test(t[i - 1]!)) return 2;
    found = true;
  }
  return found ? 1 : 0;
}

export function entrySub(e: Entry): string {
  return [e.year, venueOf(e), e.bibkey].filter(Boolean).join(' · ');
}

export function paletteItemKey(item: PaletteItem): string {
  switch (item.kind) {
    case 'entry': return `entry:${item.id}`;
    case 'project': return `project:${item.id}`;
    case 'tag': return `tag:${item.name}`;
    default: return `command:${item.id}`;
  }
}

const KIND_RANK: Record<PaletteItem['kind'], number> = { command: 0, project: 1, tag: 2, entry: 3 };

export function searchPalette(q: string, data: AppData, commands: PaletteItem[], limit = 30): PaletteItem[] {
  if (!q.trim()) return commands.slice(0, limit);
  const scored: { item: PaletteItem; score: number; order: number }[] = [];
  const push = (item: PaletteItem, score: number) => {
    if (score > 0) scored.push({ item, score, order: scored.length });
  };
  for (const c of commands) if (c.kind === 'command') push(c, scoreMatch(q, c.label));
  for (const p of data.projects) push({ kind: 'project', id: p.id, name: p.name }, scoreMatch(q, p.name));
  for (const t of data.tags) push({ kind: 'tag', name: t }, scoreMatch(q, t));
  for (const e of data.entries) {
    const byTag = e.tags.some((t) => scoreMatch(q, t) > 0) ? 1 : 0;
    push({ kind: 'entry', id: e.id, title: e.title, sub: entrySub(e) }, Math.max(scoreMatch(q, e.title), scoreMatch(q, e.bibkey), byTag));
  }
  scored.sort((a, b) => b.score - a.score || KIND_RANK[a.item.kind] - KIND_RANK[b.item.kind] || a.order - b.order);
  return scored.slice(0, limit).map((s) => s.item);
}
