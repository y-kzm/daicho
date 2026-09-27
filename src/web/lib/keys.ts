import type { Priority } from '../../shared/types';

export interface KeyLike { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey?: boolean }

export type KeyAction =
  | { type: 'move'; delta: 1 | -1 }
  | { type: 'toggle' }
  | { type: 'open' }
  | { type: 'escape' }
  | { type: 'star' }
  | { type: 'priority'; value: Priority };

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']);

/** 文字入力中の要素か (一覧のショートカットを無視する判定) */
export function isEditableTarget(t: EventTarget | null): boolean {
  if (!t || typeof t !== 'object') return false;
  const el = t as unknown as { tagName?: unknown; type?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has(String(el.type ?? 'text').toLowerCase());
  return tag === 'TEXTAREA' || tag === 'SELECT';
}

export function isPaletteShortcut(k: KeyLike): boolean {
  return (k.metaKey || k.ctrlKey) && !k.altKey && k.key.toLowerCase() === 'k';
}

/** 一覧 (テーブル・カード) のキー → 操作。修飾キー付きは扱わない */
export function listKeyAction(k: KeyLike): KeyAction | null {
  if (k.metaKey || k.ctrlKey || k.altKey) return null;
  switch (k.key) {
    case 'ArrowDown': return { type: 'move', delta: 1 };
    case 'ArrowUp': return { type: 'move', delta: -1 };
    case ' ': return { type: 'toggle' };
    case 'Enter': return { type: 'open' };
    case 'Escape': return { type: 'escape' };
    case 's':
    case 'S': return { type: 'star' };
    case '0': return { type: 'priority', value: 0 };
    case '1': return { type: 'priority', value: 1 };
    case '2': return { type: 'priority', value: 2 };
    case '3': return { type: 'priority', value: 3 };
    default: return null;
  }
}

/** フォーカスを 1 つ動かす。未フォーカス (または一覧外) なら端から始める */
export function moveFocus(ordered: number[], current: number | null, delta: 1 | -1): number | null {
  if (!ordered.length) return null;
  const i = current === null ? -1 : ordered.indexOf(current);
  if (i < 0) return delta === 1 ? ordered[0]! : ordered[ordered.length - 1]!;
  const j = Math.min(ordered.length - 1, Math.max(0, i + delta));
  return ordered[j]!;
}

/** Shift クリック用: anchor から to までの id (表示順)。anchor が無ければ to だけ */
export function rangeBetween(ordered: number[], anchor: number | null, to: number): number[] {
  const j = ordered.indexOf(to);
  if (j < 0) return [];
  const i = anchor === null ? -1 : ordered.indexOf(anchor);
  if (i < 0) return [to];
  return ordered.slice(Math.min(i, j), Math.max(i, j) + 1);
}
