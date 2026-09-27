interface Props {
  title: string;
  count: number | null;
  onOpenPalette: () => void;
  onAdd: () => void;
}

export function TopBar({ title, count, onOpenPalette, onAdd }: Props) {
  return (
    <header className="topbar">
      <h1>{title}</h1>
      {count !== null && <span className="count">{count} 件</span>}
      <span className="spacer" />
      <input className="topbar-search" type="search" readOnly aria-label="検索" placeholder="検索・コマンド (⌘K / Ctrl+K)"
        onFocus={(ev) => { ev.currentTarget.blur(); onOpenPalette(); }} />
      <button type="button" className="hbtn primary" onClick={onAdd}>+ 追加</button>
    </header>
  );
}
