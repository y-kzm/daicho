import type { Entry, FilterQuery } from '../../shared/types';

/** プロジェクトに入っている論文だけを返す。scope が null なら全体をそのまま返す */
export function scopeEntries(entries: Entry[], scope: number | null): Entry[] {
  if (scope === null) return entries;
  const key = String(scope);
  return entries.filter((e) => e.cites[key] !== undefined);
}

/** タグごとの件数 (entries に出てくるものだけ) */
export function countTags(entries: Entry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) for (const t of e.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** 全体のタグ順を保ったまま、entries で使われているタグだけを残す */
export function scopeTags(allTags: string[], entries: Entry[], scope: number | null): string[] {
  if (scope === null) return allTags;
  const used = countTags(entries);
  return allTags.filter((t) => used.has(t));
}

/**
 * プロジェクトを開いている間の条件。プロジェクトは scope に固定し (引用状態の絞り込みもそのプロジェクトで見る)、
 * 「未分類」はプロジェクト内では成り立たないので外す。
 */
export function scopeQuery<Q extends FilterQuery>(q: Q, scope: number | null): Q {
  if (scope === null) return q;
  return { ...q, projectId: scope, unfiled: undefined };
}

/** sessionStorage のキーをスコープごとに分ける (全体は従来のキーのまま) */
export function scopedKey(key: string, scope: number | null): string {
  return scope === null ? key : `${key}.p${scope}`;
}
