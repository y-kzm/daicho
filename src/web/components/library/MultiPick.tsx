import type { ReactNode } from 'react';
import { Popover } from '../Popover';

interface Props<T extends string | number> {
  label: string;
  options: { value: T; label: string }[];
  selected: T[] | undefined;
  onChange: (v: T[] | undefined) => void;
  footer?: ReactNode;
}

/** フィルタバーの複数選択。何も選ばれていないときは undefined (= 条件なし) */
export function MultiPick<T extends string | number>({ label, options, selected, onChange, footer }: Props<T>) {
  const cur = selected ?? [];
  const summary = cur.length === 0 ? label
    : cur.length === 1 ? `${label}: ${options.find((o) => o.value === cur[0])?.label ?? ''}`
      : `${label}: ${cur.length} 件`;
  const toggle = (v: T) => {
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    onChange(next.length ? next : undefined);
  };
  return (
    <Popover label={summary} className={'fbtn' + (cur.length ? ' on' : '')}>
      {() => (
        <div className="menu">
          {!options.length && <div className="menu-note">選択肢がありません</div>}
          {options.map((o) => (
            <label key={String(o.value)} className="menu-check">
              <input type="checkbox" checked={cur.includes(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
          {footer}
          {cur.length > 0 && <button type="button" className="menu-item" onClick={() => onChange(undefined)}>クリア</button>}
        </div>
      )}
    </Popover>
  );
}
