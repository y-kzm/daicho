interface Props {
  as: 'row' | 'div';
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  colSpan?: number;
}

export function GroupHeader({ as, label, count, collapsed, onToggle, colSpan = 1 }: Props) {
  const inner = (
    <button type="button" className="group-toggle" aria-expanded={!collapsed} onClick={onToggle}>
      <span className="caret">{collapsed ? '▸' : '▾'}</span>
      <span className="g-label">{label}</span>
      <span className="g-count">{count}</span>
    </button>
  );
  if (as === 'row') {
    return <tr className="group-row"><td colSpan={colSpan}>{inner}</td></tr>;
  }
  return <div className="group-head">{inner}</div>;
}
