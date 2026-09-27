interface Props {
  title: string;
  /** プロジェクトを開いているときのプロジェクト名 */
  scopeName?: string;
  count: number | null;
  addLabel: string;
  onOpenPalette: () => void;
  onAdd: () => void;
}

export function TopBar({ title, scopeName, count, addLabel, onOpenPalette, onAdd }: Props) {
  return (
    <header className="topbar">
      {scopeName !== undefined && (
        <>
          <span className="topbar-scope" title="開いているプロジェクト">{scopeName}</span>
          <span className="topbar-sep" aria-hidden="true">/</span>
        </>
      )}
      <h1>{title}</h1>
      {count !== null && <span className="count">{count} 件</span>}
      <span className="spacer" />
      <input className="topbar-search" type="search" readOnly aria-label="検索" placeholder="検索・コマンド (⌘K / Ctrl+K)"
        onFocus={(ev) => { ev.currentTarget.blur(); onOpenPalette(); }} />
      <button type="button" className="hbtn primary" onClick={onAdd}>{addLabel}</button>
    </header>
  );
}
