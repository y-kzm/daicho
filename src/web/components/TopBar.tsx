interface Props {
  title: string;
  /** プロジェクトを開いているときのプロジェクト名 */
  scopeName?: string;
  count: number | null;
  addLabel: string;
  onOpenPalette: () => void;
  onAdd: () => void;
}

/** Mac は ⌘K、それ以外は Ctrl K (どちらのキーでも開く) */
const SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

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
      <button type="button" className="topbar-search" aria-label="検索とコマンドを開く" onClick={onOpenPalette}>
        <span>検索とコマンド</span>
        <kbd>{SHORTCUT}</kbd>
      </button>
      <button type="button" className="hbtn primary" onClick={onAdd}>{addLabel}</button>
    </header>
  );
}
