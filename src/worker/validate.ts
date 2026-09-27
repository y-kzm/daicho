import type { BulkOp, CiteState, EntryInput, EntryProjectInput, Priority, ReadState } from '../shared/types';
import { BULK_MAX, CITE_STATES, ENTRY_PROJECTS_MAX, PRIORITIES, READ_STATES } from '../shared/types';
import { AppError } from './errors';

export function str(v: unknown): string {
  return String(v ?? '').trim();
}

export function strList(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).map(str).filter(Boolean);
}

/** 正の整数 (数値または数字文字列) の配列。配列でない、または 1 つでも不正な要素があれば 400 */
export function idList(v: unknown): number[] {
  if (!Array.isArray(v)) throw new AppError('リクエスト本文が不正です。');
  return v.map((x) => {
    const n = typeof x === 'number' ? x : typeof x === 'string' && /^[1-9]\d*$/.test(x) ? Number(x) : NaN;
    if (!Number.isSafeInteger(n) || n < 1) throw new AppError('リクエスト本文が不正です。');
    return n;
  });
}

/** タグ名リストを GAS の splitTags_ に合わせて正規化する。
 * 配列または文字列を受け取り、各要素をカンマ・読点で分割し、trim・空要素除去・順序を保った重複除去を行う。 */
export function splitTags(v: unknown): string[] {
  const items = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  const out: string[] = [];
  for (const item of items) {
    for (const part of String(item ?? '').split(/[,、]/)) {
      const t = part.trim();
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

export function parseEntryInput(body: unknown): EntryInput {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const title = str(b.title);
  if (!title) throw new AppError('タイトルは必須です。');
  const read = str(b.read);
  return {
    title,
    tags: splitTags(b.tags),
    summary: str(b.summary),
    url: str(b.url),
    doi: str(b.doi),
    year: str(b.year),
    country: str(b.country),
    publisher: str(b.publisher),
    journal: str(b.journal),
    impactFactor: str(b.impactFactor),
    conference: str(b.conference),
    core: str(b.core),
    bibkey: str(b.bibkey),
    read: (READ_STATES as readonly string[]).includes(read) ? read : '未読',
    note: str(b.note),
  };
}

/** POST /api/entries の projects。省略・null は空。同じプロジェクトの重複指定は不正 */
export function parseEntryProjects(v: unknown): EntryProjectInput[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new AppError('プロジェクトの指定が不正です。');
  if (v.length > ENTRY_PROJECTS_MAX) throw new AppError(`一度に指定できるプロジェクトは ${ENTRY_PROJECTS_MAX} 件までです。`);
  const seen = new Set<number>();
  return v.map((item) => {
    const o = (item && typeof item === 'object' && !Array.isArray(item) ? item : {}) as Record<string, unknown>;
    const projectId = positiveInt(o.projectId);
    if (seen.has(projectId)) throw new AppError('プロジェクトの指定が不正です。');
    seen.add(projectId);
    return { projectId, state: parseCiteState(o.state) };
  });
}

export function parseIdParam(s: string): number {
  if (!/^[1-9]\d*$/.test(s)) throw new AppError('不正な ID です。');
  return Number(s);
}

/** 本文中の id (数値または数字文字列) を正の整数として読む */
export function positiveInt(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^[1-9]\d*$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1) throw new AppError('不正な ID です。');
  return n;
}

/** 4 種の引用状態のいずれか。空文字も不正 (所属解除は呼び出し側で先に分岐する) */
export function parseCiteState(v: unknown): CiteState {
  const s = str(v);
  if (!(CITE_STATES as readonly string[]).includes(s)) throw new AppError('引用状態が不正です。');
  return s as CiteState;
}

export function parseReadState(v: unknown): ReadState {
  const s = str(v);
  if (!(READ_STATES as readonly string[]).includes(s)) throw new AppError('読了状態が不正です。');
  return s as ReadState;
}

/** 省略 (undefined) か真偽値のみ受け付ける */
export function optBool(v: unknown): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw new AppError('リクエスト本文が不正です。');
  return v;
}

export function parsePriority(v: unknown): Priority {
  if (typeof v !== 'number' || !(PRIORITIES as readonly number[]).includes(v)) throw new AppError('優先度が不正です。');
  return v as Priority;
}

export function optPriority(v: unknown): Priority | undefined {
  return v === undefined ? undefined : parsePriority(v);
}

export function assertBulkSize(n: number): void {
  if (n > BULK_MAX) throw new AppError(`一度に扱えるのは ${BULK_MAX} 件までです。`);
}

export function parseBulkOp(v: unknown): BulkOp {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  switch (o.type) {
    case 'tags':
      return { type: 'tags', add: splitTags(o.add), remove: splitTags(o.remove) };
    case 'read':
      return { type: 'read', state: parseReadState(o.state) };
    case 'flags':
      return { type: 'flags', starred: optBool(o.starred), priority: optPriority(o.priority) };
    case 'project':
      return { type: 'project', projectId: positiveInt(o.projectId), state: parseCiteState(o.state) };
    case 'unproject':
      return { type: 'unproject', projectId: positiveInt(o.projectId) };
    case 'delete':
      return { type: 'delete' };
    default:
      throw new AppError('一括操作の種類が不正です。');
  }
}

/** 並べ替え要求が現在の id 集合とちょうど一致するか (重複なし・過不足なし) */
export function sameIdSet(next: number[], current: number[]): boolean {
  if (next.length !== current.length || new Set(next).size !== next.length) return false;
  const cur = new Set(current);
  return next.every((id) => cur.has(id));
}
