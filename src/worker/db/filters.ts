import type { CiteState, EntryKind, FilterQuery, GroupKey, Priority, ReadState, SavedFilter, SortKey } from '../../shared/types';
import { CITE_STATES, ENTRY_KINDS, PRIORITIES, READ_STATES } from '../../shared/types';
import { AppError, notFound } from '../errors';
import { idList, sameIdSet, str } from '../validate';
import { FILTERS_SQL, rowToFilter, type FilterRow } from './app-data';

const SORT_KEYS: readonly SortKey[] = ['added', 'title', 'year', 'venue', 'core', 'read', 'priority', 'lastOpened'];
const GROUP_KEYS: readonly GroupKey[] = ['none', 'year', 'read', 'priority', 'firstTag', 'venue', 'cite'];
const TAG_MODES = ['any', 'all'] as const;
const SORT_DIRS = ['asc', 'desc'] as const;

function invalid(): never {
  throw new AppError('フィルタ条件が不正です。');
}

function oneOf<T>(allowed: readonly T[], v: unknown): T {
  if (!(allowed as readonly unknown[]).includes(v)) invalid();
  return v as T;
}

function listOf<T>(allowed: readonly T[], v: unknown): T[] {
  if (!Array.isArray(v)) invalid();
  return v.map((x) => oneOf(allowed, x));
}

function strings(v: unknown): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) invalid();
  return [...(v as string[])];
}

function int(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) invalid();
  return v;
}

function bool(v: unknown): boolean {
  if (typeof v !== 'boolean') invalid();
  return v;
}

function text(v: unknown): string {
  if (typeof v !== 'string') invalid();
  return v;
}

/** 保存フィルタの条件を検証する。未知のキー・型不一致は 400。 */
export function parseFilterQuery(v: unknown): FilterQuery {
  if (!v || typeof v !== 'object' || Array.isArray(v)) invalid();
  const q: FilterQuery = {};
  for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
    switch (key) {
      case 'search': q.search = text(val); break;
      case 'read': q.read = listOf<ReadState>(READ_STATES, val); break;
      case 'tags': q.tags = strings(val); break;
      case 'tagMode': q.tagMode = oneOf(TAG_MODES, val); break;
      case 'projectId': {
        const n = int(val);
        if (n < 1) invalid();
        q.projectId = n;
        break;
      }
      case 'cite': q.cite = listOf<CiteState>(CITE_STATES, val); break;
      case 'kinds': q.kinds = listOf<EntryKind>(ENTRY_KINDS, val); break;
      case 'yearFrom': q.yearFrom = int(val); break;
      case 'yearTo': q.yearTo = int(val); break;
      case 'starred': q.starred = bool(val); break;
      case 'priority': q.priority = listOf<Priority>(PRIORITIES, val); break;
      case 'unfiled': q.unfiled = bool(val); break;
      case 'sort': q.sort = oneOf(SORT_KEYS, val); break;
      case 'sortDir': q.sortDir = oneOf(SORT_DIRS, val); break;
      case 'groupBy': q.groupBy = oneOf(GROUP_KEYS, val); break;
      default: invalid();
    }
  }
  return q;
}

export function assertFilterName(name: unknown): string {
  const n = str(name);
  if (!n) throw new AppError('フィルタ名を入力してください。');
  return n;
}

export async function listFilters(db: D1Database): Promise<SavedFilter[]> {
  const r = await db.prepare(FILTERS_SQL).all<FilterRow>();
  return r.results.map(rowToFilter);
}

export async function addFilter(db: D1Database, name: unknown, query: unknown): Promise<number> {
  const n = assertFilterName(name);
  const q = parseFilterQuery(query);
  const r = await db
    .prepare(
      'INSERT INTO saved_filters (name, sort_order, query) ' +
        'VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM saved_filters), ?) RETURNING id',
    )
    .bind(n, JSON.stringify(q))
    .first<{ id: number }>();
  return Number(r?.id ?? 0);
}

/** 渡した項目だけ更新する (COALESCE)。query は丸ごと置き換える。 */
export async function updateFilter(db: D1Database, id: number, patch: { name?: unknown; query?: unknown }): Promise<void> {
  const name = patch.name === undefined ? null : assertFilterName(patch.name);
  const query = patch.query === undefined ? null : JSON.stringify(parseFilterQuery(patch.query));
  const r = await db
    .prepare('UPDATE saved_filters SET name = COALESCE(?, name), query = COALESCE(?, query) WHERE id = ?')
    .bind(name, query, id)
    .run();
  if (r.meta.changes === 0) throw notFound('フィルタ');
}

export async function deleteFilter(db: D1Database, id: number): Promise<void> {
  const r = await db.prepare('DELETE FROM saved_filters WHERE id = ?').bind(id).run();
  if (r.meta.changes === 0) throw notFound('フィルタ');
}

/** サイドバーの並び順を保存する。ids は現在の全フィルタ id を並べ替えた配列であること。 */
export async function reorderFilters(db: D1Database, ids: unknown): Promise<void> {
  const next = idList(ids);
  const current = (await db.prepare('SELECT id FROM saved_filters').all<{ id: number }>()).results.map((r) => r.id);
  if (!sameIdSet(next, current)) {
    throw new AppError('フィルタ一覧が変更されています。再読み込みしてやり直してください。', 409);
  }
  if (!next.length) return;
  await db.batch(next.map((id, i) => db.prepare('UPDATE saved_filters SET sort_order = ? WHERE id = ?').bind(i, id)));
}
