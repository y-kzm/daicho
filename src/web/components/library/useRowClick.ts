import { useSelection } from '../../state/SelectionContext';

type ClickLike = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };

/** 行・カードのクリック: 通常 = 1 件選択して詳細、⌘/Ctrl = トグル、Shift = 範囲 */
export function useRowClick(ordered: number[], onOpen?: (id: number) => void): (ev: ClickLike, id: number) => void {
  const sel = useSelection();
  return (ev, id) => {
    if (ev.shiftKey) sel.range(id, ordered);
    else if (ev.metaKey || ev.ctrlKey) sel.toggle(id);
    else {
      sel.selectOnly(id);
      onOpen?.(id);
    }
  };
}
