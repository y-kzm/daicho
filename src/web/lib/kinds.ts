import type { EntryKind } from '../../shared/types';
import type { LibrarySource } from './smart';
import { kindGroup } from './smart';
import type { ColumnKey } from './table';

/** 論文向けの列。標準文書や資料だけを見ているときは出さない */
const PAPER_ONLY: ColumnKey[] = ['venue', 'core'];

/**
 * 表示元に合わせた列。種類の枠で論文を含まないときは、会議名と CORE を外して「状態」を出す。
 * 利用者の列の設定 (stored) そのものは変えない。
 */
export function columnsFor(stored: ColumnKey[], source: LibrarySource): ColumnKey[] {
  if (source.kind !== 'kinds') return stored;
  const kinds: readonly EntryKind[] = kindGroup(source.id).kinds;
  if (kinds.includes('paper')) return stored;
  const cols = stored.filter((c) => !PAPER_ONLY.includes(c));
  return cols.includes('status') ? cols : [...cols, 'status'];
}

/** 新しく登録するときの種類の初期値。種類の枠を開いていれば、その先頭の種類 */
export function defaultKind(source: LibrarySource): EntryKind {
  return source.kind === 'kinds' ? kindGroup(source.id).kinds[0] : 'paper';
}

/** 会議・ジャーナルの欄を出す種類 */
export function hasVenue(kind: EntryKind): boolean {
  return kind === 'paper';
}

/** IETF に状態を問い合わせられる種類 */
export function isIetf(kind: EntryKind): boolean {
  return kind === 'rfc' || kind === 'draft';
}

/** その RFC が、別のエントリとして既に登録されていれば、そのエントリ */
export function findRfc<T extends { id: number; doi: string; bibkey: string }>(
  entries: readonly T[], rfcNumber: number, exceptId: number,
): T | undefined {
  const doi = `10.17487/rfc${rfcNumber}`;
  const key = new RegExp(`^rfc${rfcNumber}[a-z]?$`, 'i');
  return entries.find((e) => e.id !== exceptId && (e.doi.trim().toLowerCase() === doi || key.test(e.bibkey.trim())));
}

/** 列の選択肢から外す列 (表示元によって、出す・出さないが決まっている列) */
export function fixedColumns(source: LibrarySource): ColumnKey[] {
  if (source.kind !== 'kinds') return [];
  const kinds: readonly EntryKind[] = kindGroup(source.id).kinds;
  if (kinds.includes('paper')) return [];
  return [...PAPER_ONLY, 'status'];
}
