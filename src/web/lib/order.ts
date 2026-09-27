/** index の要素を delta (±1) だけ動かした新しい配列。範囲外なら元と同じ並びのコピー */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item as T);
  return next;
}

/**
 * 全体の並び all のうち、表示グループ group (例: アーカイブされていないプロジェクト) の中で
 * id を隣と入れ替えた全体の並びを返す。グループ外の要素の位置は変えない。
 */
export function moveWithinGroup(all: readonly number[], group: readonly number[], id: number, delta: -1 | 1): number[] {
  const i = group.indexOf(id);
  const other = i < 0 ? undefined : group[i + delta];
  const next = [...all];
  if (other === undefined) return next;
  const a = next.indexOf(id);
  const b = next.indexOf(other);
  if (a < 0 || b < 0) return next;
  next[a] = other;
  next[b] = id;
  return next;
}

export function sortByOrder<T extends { sortOrder: number }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
}
