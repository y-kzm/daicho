import type { CiteState, Entry } from '../../shared/types';

/** 1 列 (= 引用状態) の新しい並び。`api.reorderColumn(projectId, state, entryIds)` にそのまま渡す。 */
export interface ColumnOrder { state: CiteState; entryIds: number[] }

/** プロジェクト内の 1 列を表示順で返す。position 昇順 → 追加日の新しい順 → id 降順。 */
export function columnEntries(entries: Entry[], projectId: number, state: CiteState): Entry[] {
  const key = String(projectId);
  return entries
    .filter((e) => e.cites[key]?.state === state)
    .sort((a, b) => {
      const pa = a.cites[key]!.position;
      const pb = b.cites[key]!.position;
      if (pa !== pb) return pa - pb;
      if (a.added !== b.added) return a.added < b.added ? 1 : -1;
      return b.id - a.id;
    });
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max));

/**
 * entryId を toState 列の toIndex 番目の前 (0 = 先頭、列の枚数 = 末尾) へ動かしたときの、
 * 変更が必要な列の新しい順序。位置が変わらない場合とプロジェクト外の場合は空配列。
 */
export function moveCard(entries: Entry[], projectId: number, entryId: number, toState: CiteState, toIndex: number): ColumnOrder[] {
  const from = entries.find((e) => e.id === entryId)?.cites[String(projectId)]?.state;
  if (!from) return [];
  const source = columnEntries(entries, projectId, from).map((e) => e.id);
  const fromIndex = source.indexOf(entryId);
  const rest = source.filter((id) => id !== entryId);
  if (from === toState) {
    let at = clamp(toIndex, source.length);
    if (at > fromIndex) at -= 1;
    if (at === fromIndex) return [];
    return [{ state: from, entryIds: [...rest.slice(0, at), entryId, ...rest.slice(at)] }];
  }
  const dest = columnEntries(entries, projectId, toState).map((e) => e.id);
  const at = clamp(toIndex, dest.length);
  return [
    { state: from, entryIds: rest },
    { state: toState, entryIds: [...dest.slice(0, at), entryId, ...dest.slice(at)] },
  ];
}

/** states の順に各列の id を連結する (BibTeX の対象やテーブルの行順に使う)。 */
export function projectEntryIds(entries: Entry[], projectId: number, states: readonly CiteState[]): number[] {
  return states.flatMap((s) => columnEntries(entries, projectId, s).map((e) => e.id));
}
