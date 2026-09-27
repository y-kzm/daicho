import { ALL_COLUMNS, DEFAULT_COLUMNS, type ColumnKey } from '../../lib/table';
import { Popover } from '../Popover';

interface Props { columns: ColumnKey[]; onChange: (cols: ColumnKey[]) => void }

/** 歯車: 列の表示・非表示 (タイトル列は常に表示) */
export function ColumnMenu({ columns, onChange }: Props) {
  const toggle = (k: ColumnKey) => onChange(columns.includes(k) ? columns.filter((x) => x !== k) : [...columns, k]);
  return (
    <Popover label="⚙" title="列の表示" className="hbtn icon" align="right">
      {() => (
        <div className="menu">
          {ALL_COLUMNS.map((c) => (
            <label key={c.key} className="menu-check">
              <input type="checkbox" checked={c.key === 'title' || columns.includes(c.key)} disabled={c.key === 'title'}
                onChange={() => toggle(c.key)} />
              {c.label}
            </label>
          ))}
          <button type="button" className="menu-item" onClick={() => onChange(DEFAULT_COLUMNS)}>既定に戻す</button>
        </div>
      )}
    </Popover>
  );
}
