import type { Entry, FilterQuery, KindGroupId, ReadState, SavedFilter } from '../../shared/types';
import { isOpenAccess, KIND_GROUPS, KIND_LABELS, PRIORITY_LABELS } from '../../shared/types';
import { compareBy } from './table';

export type Builtin = 'all' | 'starred' | 'recentAdded' | 'recentOpened' | 'unfiled';
export const BUILTINS: Builtin[] = ['all', 'starred', 'recentAdded', 'recentOpened', 'unfiled'];
export const BUILTIN_LABELS: Record<Builtin, string> = {
  all: 'ライブラリ', starred: '★ スター', recentAdded: '最近追加', recentOpened: '最近開いた', unfiled: '未分類',
};
export const RECENT_DAYS = 30;

/** 読了状態の色 (旧 lib/filters.ts から移動) */
export const READ_COLORS: Record<string, string> = { 未読: 'var(--r-unread)', 斜め読み: 'var(--r-skim)', 精読済: 'var(--r-done)' };

export const DEFAULT_QUERY: FilterQuery = { sort: 'added', sortDir: 'desc', groupBy: 'none' };

/** 組み込みコレクション専用の条件。保存フィルタ (サーバー) には送らない */
export interface SmartQuery extends FilterQuery {
  addedWithinDays?: number;
  openedOnly?: boolean;
}

export function builtinQuery(b: Builtin, now: Date): SmartQuery {
  // now は相対日付の基準。条件は日数で持ち、評価時 (matches) に now と比べる
  void now;
  switch (b) {
    case 'starred': return { starred: true };
    case 'recentAdded': return { addedWithinDays: RECENT_DAYS, sort: 'added', sortDir: 'desc' };
    case 'recentOpened': return { openedOnly: true, sort: 'lastOpened', sortDir: 'desc' };
    case 'unfiled': return { unfiled: true };
    default: return {};
  }
}

/** now から days 日前の日付 (ローカル時刻の YYYY-MM-DD)。added もローカルの日付で入っている */
function isoDaysAgo(now: Date, days: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function haystack(e: Entry): string {
  return [e.title, e.summary, e.journal, e.conference, e.publisher, e.country, e.note, e.doi, e.bibkey, e.tags.join(' ')]
    .join(' ').toLowerCase();
}

export function matches(e: Entry, q: FilterQuery, now: Date): boolean {
  const s = q as SmartQuery;
  const read = (e.read || '未読') as ReadState;
  if (q.read?.length && !q.read.includes(read)) return false;
  if (q.tags?.length) {
    const has = (t: string) => e.tags.includes(t);
    if (q.tagMode === 'all' ? !q.tags.every(has) : !q.tags.some(has)) return false;
  }
  if (q.kinds?.length && !q.kinds.includes(e.kind)) return false;
  if (q.oa && !isOpenAccess(e.oa.status)) return false;
  const cites = e.cites || {};
  const cite = q.cite;
  if (q.projectId !== undefined) {
    // projectId が指す先のプロジェクトが既に削除済みの場合も含め、単に「所属なし」として扱う (throw しない)
    const c = cites[String(q.projectId)];
    if (!c) return false;
    if (cite?.length && !cite.includes(c.state)) return false;
  } else if (cite?.length && !Object.values(cites).some((c) => cite.includes(c.state))) {
    return false;
  }
  if (q.yearFrom !== undefined || q.yearTo !== undefined) {
    const y = parseInt(e.year, 10);
    if (Number.isNaN(y)) return false;
    if (q.yearFrom !== undefined && y < q.yearFrom) return false;
    if (q.yearTo !== undefined && y > q.yearTo) return false;
  }
  if (q.starred !== undefined && e.starred !== q.starred) return false;
  if (q.priority?.length && !q.priority.includes(e.priority)) return false;
  if (q.unfiled && (e.tags.length > 0 || Object.keys(cites).length > 0)) return false;
  if (s.addedWithinDays !== undefined && e.added < isoDaysAgo(now, s.addedWithinDays)) return false;
  if (s.openedOnly && !e.lastOpenedAt) return false;
  const words = (q.search ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) {
    const text = haystack(e);
    if (!words.every((w) => text.includes(w))) return false;
  }
  return true;
}

export function applyQuery(entries: Entry[], q: FilterQuery, now: Date): Entry[] {
  return entries.filter((e) => matches(e, q, now)).sort(compareBy(q.sort ?? 'added', q.sortDir ?? 'desc'));
}

export function countFor(entries: Entry[], q: FilterQuery, now: Date): number {
  let n = 0;
  for (const e of entries) if (matches(e, q, now)) n++;
  return n;
}

export function isFiltering(q: FilterQuery): boolean {
  return !!q.search?.trim() || !!q.read?.length || !!q.tags?.length || q.projectId !== undefined || !!q.cite?.length || !!q.kinds?.length
    || q.yearFrom !== undefined || q.yearTo !== undefined || q.starred !== undefined || !!q.priority?.length || q.unfiled === true || q.oa === true;
}

const FILTER_KEYS = [
  'search', 'read', 'tags', 'tagMode', 'projectId', 'kinds', 'cite', 'yearFrom', 'yearTo', 'starred', 'priority', 'unfiled', 'oa', 'sort', 'sortDir', 'groupBy',
] as const;

/** 保存フィルタとして送れる形 (既知キーのみ、空の値は落とす) */
export function toSavedQuery(q: FilterQuery): FilterQuery {
  const out: Record<string, unknown> = {};
  for (const k of FILTER_KEYS) {
    const v = q[k];
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out as FilterQuery;
}

const NARROWING_KEYS = [
  'search', 'read', 'tags', 'projectId', 'kinds', 'cite', 'yearFrom', 'yearTo', 'starred', 'priority', 'unfiled', 'oa',
  'addedWithinDays', 'openedOnly',
] as const;

/** 比較用に空の値をそろえる (未指定・空白だけの文字列・空配列は同じ扱い、配列は順不同) */
function norm(k: (typeof NARROWING_KEYS)[number], v: unknown): string {
  if (v === undefined) return '';
  // unfiled / openedOnly は false でも絞り込まない (starred: false は「★ なし」なので区別する)
  if (v === false && (k === 'unfiled' || k === 'openedOnly' || k === 'oa')) return '';
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.length ? JSON.stringify(v.map(String).sort()) : '';
  return JSON.stringify(v);
}

/** 表示元 (base) の条件より絞り込んでいるか。並び順・グループ化の違いは数えない */
export function isFilteringBeyond(q: FilterQuery, base: FilterQuery): boolean {
  const a = q as SmartQuery;
  const b = base as SmartQuery;
  if (NARROWING_KEYS.some((k) => norm(k, a[k]) !== norm(k, b[k]))) return true;
  return !!q.tags?.length && (q.tagMode ?? 'any') !== (base.tagMode ?? 'any');
}

/** 「フィルタを解除」: 並び順・グループ化・組み込みコレクションの条件だけ残す */
export function withoutFilters(q: FilterQuery): SmartQuery {
  const s = q as SmartQuery;
  const out: SmartQuery = {};
  if (q.sort) out.sort = q.sort;
  if (q.sortDir) out.sortDir = q.sortDir;
  if (q.groupBy) out.groupBy = q.groupBy;
  if (s.addedWithinDays !== undefined) out.addedWithinDays = s.addedWithinDays;
  if (s.openedOnly) out.openedOnly = true;
  return out;
}

/** 保存フィルタ保存ダイアログに出す条件の説明 */
export function describeQuery(q: FilterQuery, projectName: (id: number) => string | undefined): string[] {
  const out: string[] = [];
  const search = q.search?.trim();
  if (search) out.push(`検索語「${search}」`);
  if (q.read?.length) out.push('読了: ' + q.read.join('・'));
  if (q.tags?.length) out.push('タグ: ' + q.tags.join(q.tagMode === 'all' ? ' かつ ' : ' または '));
  if (q.projectId !== undefined) out.push('プロジェクト: ' + (projectName(q.projectId) ?? '(削除済み)'));
  if (q.kinds?.length) out.push('種類: ' + q.kinds.map((k) => KIND_LABELS[k]).join('・'));
  if (q.cite?.length) out.push('引用状態: ' + q.cite.join('・'));
  if (q.yearFrom !== undefined || q.yearTo !== undefined) out.push(`年: ${q.yearFrom ?? ''}〜${q.yearTo ?? ''}`);
  if (q.starred !== undefined) out.push(q.starred ? '★ あり' : '★ なし');
  if (q.priority?.length) out.push('優先度: ' + q.priority.map((p) => (p === 0 ? 'なし' : PRIORITY_LABELS[p])).join('・'));
  if (q.unfiled) out.push('未分類のみ');
  if (q.oa) out.push('Open Access のみ');
  return out;
}

/** ライブラリ画面の表示元 (サイドバーで選んだもの) */
export type LibrarySource =
  | { kind: 'builtin'; id: Builtin }
  | { kind: 'saved'; id: number }
  | { kind: 'tag'; name: string }
  /** 種類の枠 (論文 / 標準文書 / 資料) */
  | { kind: 'kinds'; id: KindGroupId };

export function kindGroup(id: KindGroupId): (typeof KIND_GROUPS)[number] {
  return KIND_GROUPS.find((g) => g.id === id) ?? KIND_GROUPS[0];
}

export function sourceQuery(src: LibrarySource, savedFilters: SavedFilter[], now: Date): FilterQuery {
  switch (src.kind) {
    case 'builtin': return { ...DEFAULT_QUERY, ...builtinQuery(src.id, now) };
    case 'saved': return { ...DEFAULT_QUERY, ...(savedFilters.find((f) => f.id === src.id)?.query ?? {}) };
    case 'kinds': return { ...DEFAULT_QUERY, kinds: [...kindGroup(src.id).kinds] };
    default: return { ...DEFAULT_QUERY, tags: [src.name] };
  }
}

export function sourceLabel(src: LibrarySource, savedFilters: SavedFilter[]): string {
  switch (src.kind) {
    case 'builtin': return BUILTIN_LABELS[src.id];
    case 'saved': return savedFilters.find((f) => f.id === src.id)?.name ?? '保存フィルタ';
    case 'kinds': return kindGroup(src.id).label;
    default: return '# ' + src.name;
  }
}

export function sameSource(a: LibrarySource, b: LibrarySource): boolean {
  if (a.kind === 'builtin' && b.kind === 'builtin') return a.id === b.id;
  if (a.kind === 'saved' && b.kind === 'saved') return a.id === b.id;
  if (a.kind === 'tag' && b.kind === 'tag') return a.name === b.name;
  if (a.kind === 'kinds' && b.kind === 'kinds') return a.id === b.id;
  return false;
}

/** 使用中の絞り込み 1 件。clear は、その条件だけを外した条件を返す */
export interface FilterChip {
  key: string;
  label: string;
  clear: (q: FilterQuery) => FilterQuery;
}

function without<T>(list: T[] | undefined, v: T): T[] | undefined {
  const next = (list ?? []).filter((x) => x !== v);
  return next.length ? next : undefined;
}

/**
 * タグが 1 つ以下なら「すべて含む」と「いずれかを含む」は同じ結果になる。
 * 表示に出ない条件を残さないよう、その場合は表示元 (base) の値に戻す。
 */
export function normalizeTagMode(q: FilterQuery, base: FilterQuery): FilterQuery {
  if ((q.tags?.length ?? 0) > 1 || q.tagMode === base.tagMode) return q;
  return { ...q, tagMode: base.tagMode };
}

/**
 * 表示元 (base) の条件に上乗せした絞り込みを、外せる単位に分けて返す。
 * 読了・タグ・引用状態・優先度は値ごと、検索語・プロジェクト・年・★ は条件ごと。
 * base に含まれる値 (タグを表示元にしているときのそのタグなど) は出さない。
 */
export function activeFilters(
  q: FilterQuery, base: FilterQuery, projectName: (id: number) => string | undefined,
): FilterChip[] {
  const out: FilterChip[] = [];
  const search = q.search?.trim();
  if (search && search !== (base.search?.trim() ?? '')) {
    out.push({ key: 'search', label: `「${search}」`, clear: (c) => ({ ...c, search: base.search }) });
  }
  for (const r of q.read ?? []) {
    if (base.read?.includes(r)) continue;
    out.push({ key: 'read:' + r, label: r, clear: (c) => ({ ...c, read: without(c.read, r) }) });
  }
  for (const t of q.tags ?? []) {
    if (base.tags?.includes(t)) continue;
    out.push({ key: 'tag:' + t, label: '# ' + t, clear: (c) => normalizeTagMode({ ...c, tags: without(c.tags, t) }, base) });
  }
  const beyondTags = (q.tags ?? []).filter((t) => !base.tags?.includes(t)).length;
  if (q.tagMode === 'all' && base.tagMode !== 'all' && (q.tags?.length ?? 0) > 1 && beyondTags > 0) {
    out.push({ key: 'tagMode', label: 'タグをすべて含む', clear: (c) => ({ ...c, tagMode: base.tagMode }) });
  }
  if (q.projectId !== undefined && q.projectId !== base.projectId) {
    const name = projectName(q.projectId) ?? '(削除済み)';
    out.push({ key: 'project', label: 'プロジェクト: ' + name, clear: (c) => ({ ...c, projectId: base.projectId }) });
  }
  for (const k of q.kinds ?? []) {
    if (base.kinds?.includes(k)) continue;
    out.push({ key: 'kind:' + k, label: KIND_LABELS[k], clear: (c) => ({ ...c, kinds: without(c.kinds, k) ?? base.kinds }) });
  }
  for (const s of q.cite ?? []) {
    if (base.cite?.includes(s)) continue;
    out.push({ key: 'cite:' + s, label: s, clear: (c) => ({ ...c, cite: without(c.cite, s) }) });
  }
  if ((q.yearFrom !== undefined || q.yearTo !== undefined) && (q.yearFrom !== base.yearFrom || q.yearTo !== base.yearTo)) {
    out.push({
      key: 'year', label: `${q.yearFrom ?? ''}〜${q.yearTo ?? ''} 年`,
      clear: (c) => ({ ...c, yearFrom: base.yearFrom, yearTo: base.yearTo }),
    });
  }
  if (q.starred !== undefined && q.starred !== base.starred) {
    out.push({ key: 'starred', label: q.starred ? '★ あり' : '★ なし', clear: (c) => ({ ...c, starred: base.starred }) });
  }
  for (const p of q.priority ?? []) {
    if (base.priority?.includes(p)) continue;
    out.push({
      key: 'priority:' + p, label: '優先度 ' + (p === 0 ? 'なし' : PRIORITY_LABELS[p]),
      clear: (c) => ({ ...c, priority: without(c.priority, p) }),
    });
  }
  if (q.oa && !base.oa) out.push({ key: 'oa', label: 'Open Access のみ', clear: (c) => ({ ...c, oa: base.oa }) });
  return out;
}
