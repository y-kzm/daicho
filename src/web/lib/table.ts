import type { CiteState, Entry, GroupKey, Priority, ReadState, SortKey } from '../../shared/types';
import { CITE_STATES, PRIORITY_LABELS, READ_STATES } from '../../shared/types';

export type ColumnKey = 'star' | 'title' | 'year' | 'venue' | 'core' | 'read' | 'priority' | 'status' | 'tags' | 'pdf' | 'projects' | 'added' | 'lastOpened';

export const ALL_COLUMNS: { key: ColumnKey; label: string; sort?: SortKey }[] = [
  { key: 'star', label: '★' },
  { key: 'title', label: 'タイトル', sort: 'title' },
  { key: 'year', label: '年', sort: 'year' },
  { key: 'venue', label: '会議・誌名', sort: 'venue' },
  { key: 'core', label: 'CORE・IF', sort: 'core' },
  { key: 'status', label: '状態' },
  { key: 'read', label: '読了', sort: 'read' },
  { key: 'priority', label: '優先度', sort: 'priority' },
  { key: 'tags', label: 'タグ' },
  { key: 'pdf', label: 'PDF' },
  { key: 'projects', label: 'プロジェクト数' },
  { key: 'added', label: '追加日', sort: 'added' },
  { key: 'lastOpened', label: '最近開いた', sort: 'lastOpened' },
];

export const DEFAULT_COLUMNS: ColumnKey[] = ['star', 'title', 'year', 'venue', 'core', 'read', 'priority', 'tags', 'pdf', 'added'];

/** CORE ランクの順 (A* が先頭)。旧 lib/filters.ts から移動 */
export const CORE_ORDER: Record<string, number> = { 'A*': 0, 'A＊': 0, A: 1, B: 2, C: 3 };

export const SORT_LABELS: Record<SortKey, string> = {
  added: '追加日', title: 'タイトル', year: '年', venue: '会議・誌名', core: 'CORE', read: '読了', priority: '優先度', lastOpened: '最近開いた',
};

export const GROUP_LABELS: Record<GroupKey, string> = {
  none: 'なし', year: '年', read: '読了状態', priority: '優先度', firstTag: '先頭タグ', venue: '会議・誌名', cite: '引用状態',
};

/** グループ化の選択肢。'cite' はプロジェクトを開いているときだけ出す */
export function groupKeysFor(projectId: number | undefined): GroupKey[] {
  const keys = Object.keys(GROUP_LABELS) as GroupKey[];
  return projectId === undefined ? keys.filter((k) => k !== 'cite') : keys;
}

/** 'cite' はプロジェクトが無いと分けられないので、その場合は 'none' として扱う */
export function effectiveGroup(by: GroupKey, projectId: number | undefined): GroupKey {
  return by === 'cite' && projectId === undefined ? 'none' : by;
}

/** 会議名・誌名。論文以外では出さない (種類を変える前の値が残っていても表示しない) */
export function venueOf(e: Entry): string {
  if (e.kind !== 'paper') return '';
  return (e.conference || e.journal).trim();
}

type SortValue = number | string | null;

function sortValue(e: Entry, key: SortKey): SortValue {
  switch (key) {
    case 'added': return e.added || null;
    case 'title': return e.title.trim().toLowerCase() || null;
    case 'year': {
      const n = parseInt(e.year, 10);
      return Number.isNaN(n) ? null : n;
    }
    case 'venue': return venueOf(e).toLowerCase() || null;
    case 'core': return CORE_ORDER[e.core.trim()] ?? null;
    case 'read': {
      const i = READ_STATES.indexOf((e.read || '未読') as ReadState);
      return i < 0 ? null : i;
    }
    case 'priority': return e.priority;
    case 'lastOpened': return e.lastOpenedAt || null;
    default: return null;
  }
}

/** 同値のときの順: 追加日の新しい順、同日は id の大きい順 */
function tieBreak(a: Entry, b: Entry): number {
  return b.added.localeCompare(a.added) || b.id - a.id;
}

export function compareBy(key: SortKey, dir: 'asc' | 'desc'): (a: Entry, b: Entry) => number {
  const sign = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1; // 値なしは常に末尾
      return tieBreak(a, b);
    }
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ja');
    if (c !== 0) return c * sign;
    return key === 'added' ? (a.id - b.id) * sign : tieBreak(a, b);
  };
}

const DESC_FIRST: ReadonlySet<SortKey> = new Set<SortKey>(['added', 'year', 'priority', 'lastOpened']);

export function defaultDir(key: SortKey): 'asc' | 'desc' {
  return DESC_FIRST.has(key) ? 'desc' : 'asc';
}

/** ヘッダクリック: 同じ列なら昇降を反転、別の列ならその列の既定方向 */
export function nextSort(cur: { key: SortKey; dir: 'asc' | 'desc' }, clicked: SortKey): { key: SortKey; dir: 'asc' | 'desc' } {
  if (cur.key === clicked) return { key: clicked, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
  return { key: clicked, dir: defaultDir(clicked) };
}

export interface Group { key: string; label: string; entries: Entry[] }

function groupKeyOf(e: Entry, by: GroupKey, projectId?: number): string {
  switch (by) {
    case 'cite': return projectId === undefined ? '' : e.cites[String(projectId)]?.state ?? '';
    case 'year': return /^\d{4}$/.test(e.year.trim()) ? e.year.trim() : '';
    case 'read': return e.read || '未読';
    case 'priority': return String(e.priority);
    case 'firstTag': return e.tags[0] ?? '';
    case 'venue': return venueOf(e);
    default: return '';
  }
}

function groupLabel(key: string, by: GroupKey): string {
  if (by === 'priority') return key === '0' ? '優先度なし' : '優先度 ' + PRIORITY_LABELS[Number(key) as Priority];
  if (key) return key;
  if (by === 'year') return '年なし';
  if (by === 'firstTag') return 'タグなし';
  if (by === 'venue') return '会議・誌名なし';
  if (by === 'cite') return 'プロジェクト外';
  return '';
}

function compareGroupKeys(by: GroupKey): (a: string, b: string) => number {
  const inner = (a: string, b: string): number => {
    switch (by) {
      case 'year':
      case 'priority': return Number(b) - Number(a);
      case 'read': {
        const ia = READ_STATES.indexOf(a as ReadState);
        const ib = READ_STATES.indexOf(b as ReadState);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      }
      case 'cite': {
        const ia = CITE_STATES.indexOf(a as CiteState);
        const ib = CITE_STATES.indexOf(b as CiteState);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      }
      default: return a.localeCompare(b, 'ja');
    }
  };
  return (a, b) => {
    if (a === '' && b !== '') return 1;
    if (b === '' && a !== '') return -1;
    return inner(a, b);
  };
}

/** 入力の並び (ソート済み) を保ったままグループに分ける。'none' は key '' の 1 グループ。
 * projectId は 'cite' (引用状態) で分けるときに使う */
export function groupEntries(entries: Entry[], groupBy: GroupKey, projectId?: number): Group[] {
  const by = effectiveGroup(groupBy, projectId);
  if (by === 'none') return [{ key: '', label: '', entries }];
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = groupKeyOf(e, by, projectId);
    const list = map.get(k);
    if (list) list.push(e);
    else map.set(k, [e]);
  }
  return [...map.keys()].sort(compareGroupKeys(by)).map((k) => ({ key: k, label: groupLabel(k, by), entries: map.get(k)! }));
}

export function isGrouped(groups: Group[]): boolean {
  return !(groups.length === 1 && groups[0]!.key === '' && groups[0]!.label === '');
}

/** 折りたたみ状態の保存キー (groupBy ごとに独立させる) */
export function collapseKey(by: GroupKey, key: string): string {
  return `${by}:${key}`;
}

export function collapsedSet(stored: string[], by: GroupKey): Set<string> {
  const prefix = by + ':';
  return new Set(stored.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
}

/** 画面に出ている行の id (表示順)。キーボード移動と Shift 選択に使う */
export function visibleIds(groups: Group[], collapsed: ReadonlySet<string>): number[] {
  return groups.flatMap((g) => (collapsed.has(g.key) ? [] : g.entries.map((e) => e.id)));
}
