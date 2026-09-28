/** 行・カードをクリックしたときの動作 */
export type RowAction = 'open' | 'toggle' | 'range';

export interface ClickLike { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }

/**
 * 通常: クリックは詳細を開くだけで、選択はしない。
 * 選択モード: クリックで選択を切り替え、Shift で範囲を選ぶ (詳細は開かない)。
 * 修飾キー (Shift / ⌘ / Ctrl) 付きのクリックは、通常でも選択として扱う。呼び出し側が選択モードに入れる。
 */
export function rowAction(mode: boolean, ev: ClickLike): RowAction {
  if (ev.shiftKey) return 'range';
  if (ev.metaKey || ev.ctrlKey) return 'toggle';
  return mode ? 'toggle' : 'open';
}
