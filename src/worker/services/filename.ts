import type { AttachmentKind } from '../../shared/types';

const TITLE_MAX = 80;
const FALLBACK = 'untitled';

/** ファイル名に使えない文字 (Windows / macOS / Drive のどれでも安全な形にする) と制御文字 */
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/** 1 つの部品を整える: 危険な文字を空白に、空白の連続を 1 つに、前後の空白とピリオドを除く */
export function cleanPart(s: string): string {
  return s.normalize('NFC').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '');
}

/** 長いタイトルは単語の切れ目で切る (切れ目が無ければ文字数で切る)。絵文字などの途中では切らない */
export function truncateTitle(title: string, max = TITLE_MAX): string {
  const chars = Array.from(title);
  if (chars.length <= max) return title;
  const head = chars.slice(0, max).join('');
  const cut = head.lastIndexOf(' ');
  return (cut >= max / 2 ? head.slice(0, cut) : head).trim();
}

/**
 * `{bibkey} - {title}.pdf`。本文以外は ` ({種類})` を付ける。
 * 同じ名前が既にあれば ` (2)`, ` (3)` … を付ける (taken は同じ論文の既存ファイル名)。
 */
export function attachmentName(
  entry: { bibkey: string; title: string }, kind: AttachmentKind, taken: readonly string[] = [],
): string {
  const key = cleanPart(entry.bibkey);
  const title = truncateTitle(cleanPart(entry.title));
  const stem = [key, title].filter(Boolean).join(' - ') || FALLBACK;
  const base = kind === '本文' ? stem : `${stem} (${kind})`;
  const used = new Set(taken.map((n) => n.toLowerCase()));
  let name = `${base}.pdf`;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i}).pdf`;
  return name;
}
