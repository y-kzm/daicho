import { rowAction, type ClickLike } from '../../lib/selection';
import { useSelection } from '../../state/SelectionContext';

/**
 * 行・カードのクリック。通常は詳細を開くだけで、選択はしない。
 * 選択モードでは選択を切り替える。修飾キー付きのクリックは、選択モードに入ってから選択する。
 */
export function useRowClick(ordered: number[], onOpen?: (id: number) => void): (ev: ClickLike, id: number) => void {
  const sel = useSelection();
  return (ev, id) => {
    const action = rowAction(sel.mode, ev);
    if (action === 'open') {
      sel.setFocus(id);
      onOpen?.(id);
      return;
    }
    if (!sel.mode) sel.setMode(true);
    if (action === 'range') sel.range(id, ordered);
    else sel.toggle(id);
  };
}
