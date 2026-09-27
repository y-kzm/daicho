import { useState } from 'react';
import { Popover } from '../Popover';
import { InlineName } from './InlineName';

export interface MenuAction { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }

interface Props {
  label: string;
  count?: number;
  on: boolean;
  dot?: string;
  onClick: () => void;
  menu?: MenuAction[];
  onRename?: (name: string) => void;
}

export function SideItem({ label, count, on, dot, onClick, menu = [], onRename }: Props) {
  const [editing, setEditing] = useState(false);
  if (editing && onRename) {
    return (
      <InlineName initial={label}
        onSubmit={(v) => { setEditing(false); if (v !== label) onRename(v); }}
        onCancel={() => setEditing(false)} />
    );
  }
  const actions: MenuAction[] = onRename ? [{ label: '名前を変更', onSelect: () => setEditing(true) }, ...menu] : menu;
  return (
    <div className={'side-row' + (on ? ' on' : '') + (actions.length ? ' has-menu' : '')}>
      <button type="button" className={'side-item' + (on ? ' on' : '')} onClick={onClick}>
        <span className="lbl">
          {dot && <span className="dot" style={{ background: dot }} />}
          <span>{label}</span>
        </span>
        {count !== undefined && <span className="n">{count}</span>}
      </button>
      {actions.length > 0 && (
        <Popover label="…" className="side-more" title="メニュー" align="right">
          {(close) => (
            <div className="menu">
              {actions.map((a) => (
                <button key={a.label} type="button" className={'menu-item' + (a.danger ? ' danger' : '')} disabled={a.disabled}
                  onClick={() => { close(); a.onSelect(); }}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}
